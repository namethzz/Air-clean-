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
# Aircon Passport units are optional, owned by one account, and can be linked to a request.
unit = call('/air-conditioners', 'POST', {'label': 'แอร์ห้องนอน', 'brand': 'Daikin', 'type': 'ติดผนัง'}, customer, 201)
assert unit['health'] == 'due' and unit['services'] == []
call('/air-conditioners', 'POST', {'label': 'อนาคต', 'lastServiceDate': (datetime.now(timezone.utc) + timedelta(days=3)).isoformat()}, customer, 400)
call('/bookings', 'POST', {**payload, 'airConditionerId': unit['id']}, other_customer, 400)
spare = call('/air-conditioners', 'POST', {'label': 'ลบได้'}, customer, 201)
call(f"/air-conditioners/{spare['id']}", 'DELETE', token=other_customer, expected=404)
call(f"/air-conditioners/{spare['id']}", 'DELETE', token=customer, expected=204)
booking = call('/bookings', 'POST', {**payload, 'airConditionerId': unit['id']}, customer, 201)
id = booking['id']
assert booking['airConditionerId'] == unit['id']
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
call(f'/bookings/{id}/location', 'POST', {'latitude': 13.75, 'longitude': 100.50}, tech, 409)
for status in ['กำลังเดินทาง', 'ถึงหน้างาน', 'กำลังดำเนินการ']:
    call(f'/bookings/{id}/status', 'PATCH', {'status': status}, tech, 204)
    if status == 'กำลังเดินทาง':
        coords = {'latitude': 13.75, 'longitude': 100.50, 'accuracy': 10}
        call(f'/bookings/{id}/location', 'POST', coords, customer, 403)
        call(f'/bookings/{id}/location', 'POST', coords, other_tech, 403)
        call(f'/bookings/{id}/tracking', token=other_customer, expected=403)
        call(f'/bookings/{id}/tracking', token=other_tech, expected=403)
        call(f'/bookings/{id}/location', 'POST', {**coords, 'latitude': 91}, tech, 400)
        call(f'/bookings/{id}/location', 'POST', coords, tech)
        tracked = call(f'/bookings/{id}/tracking', token=customer)
        assert tracked['technicianLatitude'] == coords['latitude'] and tracked['locationUpdatedAt']
    if status == 'ถึงหน้างาน':
        call(f'/bookings/{id}/location', 'POST', {'latitude': 13.76, 'longitude': 100.51}, tech, 409)
        assert call(f'/bookings/{id}/tracking', token=customer)['status'] == 'ถึงหน้างาน'
report = {'bookingId': id, 'summary': 'ล้างครบ', 'cleanedFilter': True, 'cleanedCoil': True, 'checkedDrain': True, 'checkedCooling': True}
call('/service-reports', 'POST', report, tech, 201)
assert call(f'/bookings/{id}', token=customer)['status'] == 'รอชำระเงิน'
call('/service-reports', 'POST', report, tech, 409)
call(f'/bookings/{id}/reviews', 'POST', {'rating': 5, 'comment': 'ก่อนเสร็จ'}, customer, 409)
call(f'/bookings/{id}/payment-confirmation', 'PATCH', {'method': 'Cash', 'confirmed': True}, customer)
call(f'/bookings/{id}/payment-confirmation', 'PATCH', {'method': 'PromptPay', 'confirmed': True}, tech, 409)
finished = call(f'/bookings/{id}/payment-confirmation', 'PATCH', {'method': 'Cash', 'confirmed': True}, tech)
assert finished['status'] == 'เสร็จสิ้น' and finished['paymentStatus'] == 'Paid'
assert call('/technicians/me', token=tech)['jobsCompleted'] == 1
history = call(f"/air-conditioners/{unit['id']}/passport", token=customer)
assert len(history['services']) == 1 and history['services'][0]['summary'] == 'ล้างครบ' and history['health'] == 'good'
call(f"/air-conditioners/{unit['id']}/passport", token=other_customer, expected=403)
# Reviews: owner only, once, and they update the technician's rating.
call(f'/bookings/{id}/reviews', 'POST', {'rating': 4, 'comment': 'x'}, other_customer, 404)
call(f'/bookings/{id}/reviews', 'POST', {'rating': 6, 'comment': ''}, customer, 400)
call(f'/bookings/{id}/reviews', 'POST', {'rating': 4, 'comment': 'ตรงเวลา'}, customer, 201)
call(f'/bookings/{id}/reviews', 'POST', {'rating': 5, 'comment': 'ซ้ำ'}, customer, 409)
assert call(f'/bookings/{id}', token=customer)['customerRating'] == 4
rated = call('/technicians/me', token=tech)
assert rated['rating'] == 4 and rated['reviewCount'] == 1
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
# A technician sees only their own offer, never a competitor's quote.
mine = next(item for item in call('/technician-jobs?latitude=13.7563&longitude=100.5018&radiusKm=5', token=tech) if item['id'] == row['id'])
assert [item['technicianId'] for item in mine['applicants']] == [profile['id']]
# Only an administrator can verify a technician profile.
call(f"/technicians/{profile['id']}/verification", 'PATCH', {'verified': True}, tech, 403)
call(f"/technicians/{profile['id']}/verification", 'PATCH', {'verified': True}, customer, 403)
admin_email, admin_password = os.environ.get('TEST_ADMIN_EMAIL'), os.environ.get('TEST_ADMIN_PASSWORD')
if admin_email and admin_password:
    admin = call('/auth/login', 'POST', {'email': admin_email, 'password': admin_password})['token']
    assert call(f"/technicians/{profile['id']}/verification", 'PATCH', {'verified': True}, admin)['verified']
    assert call('/technicians/me', token=tech)['verified']
    call('/technicians/999999/verification', 'PATCH', {'verified': True}, admin, 404)
print('Marketplace API checks passed: privacy, ownership, quotes, status, reports, payment, reviews, passport, verification and cancellation.')
