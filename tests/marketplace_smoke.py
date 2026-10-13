"""End-to-end API checks. Run only against an isolated, disposable MongoDB database."""
import json
import os
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

BASE = os.environ.get('TEST_API_URL', 'http://localhost:5080/api')

def call(path, method='GET', body=None, token=None, expected=200):
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    req = Request(BASE + path, data=json.dumps(body).encode() if body is not None else None, headers=headers, method=method)
    try:
        with urlopen(req, timeout=20) as response:
            status, data = response.status, response.read()
    except HTTPError as error:
        status, data = error.code, error.read()
    assert status == expected, f'{method} {path}: expected {expected}, got {status}: {data.decode()}'
    return json.loads(data) if data else None

for _ in range(60):
    try:
        call('/technicians')
        break
    except (URLError, TimeoutError):
        time.sleep(1)
else:
    raise AssertionError('API did not become ready')

suffix = uuid.uuid4().hex

def account(role):
    return call('/auth/register', 'POST', {'fullName': 'ทดสอบ ' + role, 'email': role + uuid.uuid4().hex + '@example.test', 'password': 'CiTestPass123!', 'role': role}, expected=201)['token']

customer = account('Customer')
other_customer = account('customer')
# Marketplace requests must be possible even before any technician creates a profile.
payload = {'service': 'ล้างแอร์มาตรฐาน', 'unitLabel': 'แอร์ห้องนอน', 'propertyType': 'บ้านเดี่ยว', 'unitCount': 2,
           'address': 'PRIVATE-HOUSE-123', 'scheduledAt': (datetime.now(timezone.utc) + timedelta(days=2)).isoformat(),
           'price': 0, 'latitude': 13.7563, 'longitude': 100.5018}
booking = call('/bookings', 'POST', payload, customer, 201)
id = booking['id']
assert booking['technicianId'] == 0 and booking['status'] == 'เปิดรับช่าง'
tech = account('Technician')
other_tech = account('technician')
profile = call('/technicians/me', token=tech)
call('/technicians/me', token=customer, expected=403)
call('/technicians/me', 'PATCH', {'title': 'ช่างทดสอบ', 'area': 'บางเขน', 'basePrice': 600,
     'availableText': '09:00–18:00', 'skills': 'ล้างแอร์มาตรฐาน, ตรวจเช็ก'}, tech)
call('/technicians/me', 'PATCH', {'title': 'ช่างทดสอบ', 'area': 'บางเขน', 'basePrice': -1,
     'availableText': 'ทุกวัน', 'skills': 'ล้างแอร์'}, tech, 400)
assert not call('/technicians/me', token=tech)['verified']
feed = call('/technician-jobs?latitude=13.7563&longitude=100.5018&radiusKm=5', token=tech)
job = next(row for row in feed if row['id'] == id)
assert job['latitude'] is None and job['longitude'] is None and 'PRIVATE-HOUSE' not in json.dumps(job)
call('/bookings/' + str(id), token=other_customer, expected=403)
call('/bookings/' + str(id), token=tech, expected=403)
application = call(f'/bookings/{id}/applications', 'POST', {'note': 'พร้อมรับงาน'}, tech)
assert application['latitude'] is None and application['longitude'] is None and 'PRIVATE-HOUSE' not in json.dumps(application)
call(f'/bookings/{id}/applications', 'POST', {}, tech, 409)
assert application['applicants'][0]['quote'] == 1200
# A subsequent rate change must not change an already submitted quote.
call('/technicians/me', 'PATCH', {'title': 'ช่างทดสอบ', 'area': 'บางเขน', 'basePrice': 700,
     'availableText': 'ทุกวัน', 'skills': 'ล้างแอร์'}, tech)
confirmed = call(f'/bookings/{id}/confirm-technician', 'POST', {'technicianId': profile['id']}, customer)
assert confirmed['price'] == 1200 and confirmed['status'] == 'ยืนยันแล้ว'
assert call(f'/bookings/{id}', token=tech)['address'] == 'PRIVATE-HOUSE-123'
call(f'/bookings/{id}/applications', 'POST', {}, other_tech, 409)
call(f'/bookings/{id}/status', 'PATCH', {'status': 'เสร็จสิ้น'}, tech, 409)
for status in ['กำลังเดินทาง', 'ถึงหน้างาน', 'กำลังดำเนินการ', 'รอชำระเงิน']:
    call(f'/bookings/{id}/status', 'PATCH', {'status': status}, tech, 204)
    if status == 'กำลังเดินทาง':
        call(f'/bookings/{id}/location', 'POST', {'latitude': 13.75, 'longitude': 100.50, 'accuracy': 10}, tech)
call(f'/bookings/{id}/payment-confirmation', 'PATCH', {'method': 'Cash', 'confirmed': True}, customer)
call(f'/bookings/{id}/payment-confirmation', 'PATCH', {'method': 'PromptPay', 'confirmed': True}, tech, 409)
finished = call(f'/bookings/{id}/payment-confirmation', 'PATCH', {'method': 'Cash', 'confirmed': True}, tech)
assert finished['status'] == 'เสร็จสิ้น' and finished['paymentStatus'] == 'Paid'
# Cancellation in each of the two marketplace waiting states.
for interested in [False, True]:
    row = call('/bookings', 'POST', payload, customer, 201)
    if interested:
        call(f"/bookings/{row['id']}/applications", 'POST', {}, tech)
    call(f"/bookings/{row['id']}/status", 'PATCH', {'status': 'ยกเลิก'}, customer, 204)
    assert call(f"/bookings/{row['id']}", token=customer)['status'] == 'ยกเลิก'
# Two overlapping proposals must not silently discard an applicant.
row = call('/bookings', 'POST', payload, customer, 201)
other_profile = call('/technicians/me', token=other_tech)
def concurrent_apply(token):
    try:
        call(f"/bookings/{row['id']}/applications", 'POST', {}, token)
    except AssertionError as error:
        assert 'got 409:' in str(error), str(error)
        call(f"/bookings/{row['id']}/applications", 'POST', {}, token)
with ThreadPoolExecutor(max_workers=2) as pool:
    list(pool.map(concurrent_apply, [tech, other_tech]))
assert len(call(f"/bookings/{row['id']}", token=customer)['applicants']) == 2
print('Marketplace API checks passed: privacy, ownership, quotes, status, payment and cancellation.')
