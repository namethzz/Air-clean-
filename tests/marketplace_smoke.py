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

def register(role, **extra):
    email = role.lower() + uuid.uuid4().hex + '@example.test'
    body = {'fullName': 'ทดสอบ ' + role, 'email': email, 'password': 'CiTestPass123!', 'role': role, **extra}
    if role.lower() == 'technician':
        body = {'phone': '081-234-5678', 'serviceArea': 'บางเขน', 'experienceYears': 3, **body}
    return call('/auth/register', 'POST', body, expected=201)['token'], email

def account(role):
    return register(role)[0]

# The smallest thing the server accepts as a JPEG (it checks the file's first bytes).
TINY_JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8U'

def send_id(token):
    """Finishes a technician's setup: the ID card, what they clean, their prices, then sends it for review."""
    sent = call('/technicians/me/documents', 'POST', {'kind': 'idcard', 'data': TINY_JPEG}, token, 201)
    me = call('/technicians/me', token=token)
    if me['needsSetup']:
        call('/technicians/me', 'PATCH', {'title': me['title'], 'area': me['area'], 'basePrice': me['prices']['wall'], 'availableText': 'ทุกวัน 08:00–18:00',
             'skills': ', '.join(me['skills']) or 'ล้างแอร์', 'phone': me['phone'], 'prices': me['prices'], 'kinds': ['wall', 'hanging', 'cassette'], 'offersDeep': True}, token)
        assert not call('/technicians/me/submit', 'POST', {}, token)['needsSetup']
    return sent

admin_email, admin_password = os.environ['TEST_ADMIN_EMAIL'], os.environ['TEST_ADMIN_PASSWORD']
admin = call('/auth/login', 'POST', {'email': admin_email, 'password': admin_password})['token']
# Accounts saved before session versions existed must keep working after an upgrade.
legacy_token, legacy_email = register('Customer')
if os.environ.get('MONGODB_URI'):
    from pymongo import MongoClient
    MongoClient(os.environ['MONGODB_URI'])[os.environ.get('MONGODB_DATABASE', 'airclean_ci')].users.update_one(
        {'Email': legacy_email}, {'$unset': {'SessionVersion': '', 'ExternalLogins': ''}})
    legacy_token = call('/auth/login', 'POST', {'email': legacy_email, 'password': 'CiTestPass123!'})['token']
call('/auth/me', token=legacy_token)
call('/bookings', token=legacy_token)

customer = account('Customer')
other_customer = account('customer')
# Marketplace requests must be possible even before any technician creates a profile.
payload = {'service': 'ล้างแอร์มาตรฐาน', 'unitLabel': 'แอร์ห้องนอน', 'propertyType': 'บ้านเดี่ยว', 'unitCount': 2,
           'address': 'PRIVATE-HOUSE-123', 'scheduledAt': (datetime.now(timezone.utc) + timedelta(days=2)).isoformat(),
           'price': 0, 'latitude': 13.7563, 'longitude': 100.5018, 'contactPhone': '081-000-0000'}
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
# Technician sign-up is an application: contact details are required and the account starts pending.
call('/auth/register', 'POST', {'fullName': 'ไม่มีเบอร์', 'email': uuid.uuid4().hex + '@example.test', 'password': 'CiTestPass123!', 'role': 'Technician', 'serviceArea': 'บางเขน'}, expected=400)
call('/auth/register', 'POST', {'fullName': 'ไม่มีพื้นที่', 'email': uuid.uuid4().hex + '@example.test', 'password': 'CiTestPass123!', 'role': 'Technician', 'phone': '0812345678'}, expected=400)
tech = account('Technician')
other_tech = account('technician')
profile = call('/technicians/me', token=tech)
assert profile['verificationStatus'] == 'Pending' and not profile['verified'] and profile['phone'] == '081-234-5678'
call('/technicians/me', token=customer, expected=403)
# A new technician sets up what they clean and their prices, with the ID card, before the admin can approve them.
assert profile['needsSetup'] and not profile['pricesSet']
missing = call('/technicians/me/submit', 'POST', {}, tech, 400)
assert missing['code'] == 'setup_incomplete' and 'ราคา' in missing['message'] and 'บัตรประชาชน' in missing['message']
base_patch = {'title': 'ช่างทดสอบ', 'area': 'บางเขน', 'basePrice': 600, 'availableText': 'ทุกวัน', 'skills': 'ล้างแอร์'}
call('/technicians/me', 'PATCH', {**base_patch, 'kinds': ['roof']}, tech, 400)
call('/technicians/me', 'PATCH', {**base_patch, 'kinds': []}, tech, 400)
call('/technicians/me', 'PATCH', {'title': 'ช่างทดสอบ', 'area': 'บางเขน', 'basePrice': 600,
     'availableText': '09:00–18:00', 'skills': 'ล้างแอร์มาตรฐาน, ตรวจเช็ก'}, tech)
call('/technicians/me', 'PATCH', {'title': 'ช่างทดสอบ', 'area': 'บางเขน', 'basePrice': -1,
     'availableText': 'ทุกวัน', 'skills': 'ล้างแอร์'}, tech, 400)
call('/technicians/me', 'PATCH', {'title': 'ช่างทดสอบ', 'area': 'บางเขน', 'basePrice': 600,
     'availableText': 'ทุกวัน', 'skills': 'ล้างแอร์', 'phone': '12'}, tech, 400)
# Pending technicians cannot browse or bid and are not listed publicly.
call('/technician-jobs?latitude=13.7563&longitude=100.5018&radiusKm=5', token=tech, expected=403)
call(f'/bookings/{id}/applications', 'POST', {}, tech, 403)
assert all(row['id'] != profile['id'] for row in call('/technicians'))
queue = call('/admin/technicians?status=Pending', token=admin)
assert any(row['id'] == profile['id'] and row['phone'] for row in queue)
call('/admin/technicians', token=tech, expected=403)
# Only an administrator decides; a rejection needs a reason and the technician can resubmit.
call(f"/technicians/{profile['id']}/verification", 'PATCH', {'verified': True}, tech, 403)
call(f"/technicians/{profile['id']}/verification", 'PATCH', {'verified': True}, customer, 403)
call(f"/technicians/{profile['id']}/verification", 'PATCH', {'verified': False}, admin, 400)
rejected = call(f"/technicians/{profile['id']}/verification", 'PATCH', {'verified': False, 'note': 'เบอร์โทรติดต่อไม่ได้'}, admin)
assert rejected['verificationStatus'] == 'Rejected'
assert 'เบอร์โทรติดต่อไม่ได้' in str(call('/technician-jobs?latitude=13.7563&longitude=100.5018&radiusKm=5', token=tech, expected=403))
assert call('/technicians/me', 'PATCH', {'title': 'ช่างทดสอบ', 'area': 'บางเขน', 'basePrice': 600,
     'availableText': '09:00–18:00', 'skills': 'ล้างแอร์มาตรฐาน, ตรวจเช็ก', 'phone': '089-999-0000'}, tech)['verificationStatus'] == 'Pending'
# Approval needs the ID card on file.
assert 'บัตรประชาชน' in call(f"/technicians/{profile['id']}/verification", 'PATCH', {'verified': True}, admin, 409)['message']
for token in [tech, other_tech]:
    send_id(token)
    row = call('/technicians/me', token=token)
    assert call(f"/technicians/{row['id']}/verification", 'PATCH', {'verified': True}, admin)['verificationStatus'] == 'Approved'
assert call('/technicians/me', token=tech)['verified']
assert any(row['id'] == profile['id'] for row in call('/technicians'))
call('/technicians/999999/verification', 'PATCH', {'verified': True}, admin, 404)
feed = call('/technician-jobs?latitude=13.7563&longitude=100.5018&radiusKm=5', token=tech)
job = next(row for row in feed if row['id'] == id)
assert job['latitude'] is None and job['longitude'] is None and 'PRIVATE-HOUSE' not in json.dumps(job)
# Distance to an open job comes from a random point drawn for the job, in whole kilometres only.
assert job['distanceKm'] == int(job['distanceKm']) and job['distanceKm'] >= 1
if os.environ.get('MONGODB_URI'):
    from pymongo import MongoClient
    from math import radians, sin, cos, asin, sqrt
    stored = MongoClient(os.environ['MONGODB_URI'])[os.environ.get('MONGODB_DATABASE', 'airclean_ci')].bookings.find_one({'_id': id})
    lat1, lon1, lat2, lon2 = map(radians, [stored['Latitude'], stored['Longitude'], stored['FuzzLatitude'], stored['FuzzLongitude']])
    meters = 2 * 6371000 * asin(sqrt(sin((lat2 - lat1) / 2) ** 2 + cos(lat1) * cos(lat2) * sin((lon2 - lon1) / 2) ** 2))
    assert 290 <= meters <= 710, meters
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
# Customers describe what they can see; every quote comes from the technician's own price list, line by line.
price_list = {'wall': 650, 'wallDeep': 1300, 'hanging': 1000, 'hangingDeep': 1900, 'cassette': 1200, 'cassetteDeep': 2300, 'large': 250, 'hardAccess': 300}
tech_fields = {'title': 'ช่างทดสอบ', 'area': 'บางเขน', 'basePrice': 650, 'availableText': 'ทุกวัน', 'skills': 'ล้างแอร์'}
call('/technicians/me', 'PATCH', {**tech_fields, 'prices': {**price_list, 'wallDeep': 500}}, tech, 400)
saved_list = call('/technicians/me', 'PATCH', {**tech_fields, 'prices': price_list}, tech)
assert saved_list['prices']['wallDeep'] == 1300 and saved_list['basePrice'] == 650
# Fewer than three approved technicians: the going rate is AirClean's reference.
guide = call('/price-guide', token=tech)
assert guide['reference'] and guide['typical']['wall'] == 600
described = {'items': [{'kind': 'wall', 'count': 2, 'large': 1}, {'kind': 'cassette', 'count': 1}], 'deep': False, 'hardAccessUnits': 1}
estimate = call('/price-estimate', 'POST', described, customer)
assert estimate['range']['reference'] and estimate['range']['low'] < estimate['range']['mid'] < estimate['range']['high']
assert sum(x['amount'] for x in estimate['lines']) == estimate['range']['mid'] == 600 * 2 + 1200 + 200 + 300
call('/price-estimate', 'POST', {'items': [{'kind': 'roof', 'count': 1}]}, customer, 400)
call('/price-estimate', 'POST', {'items': [None]}, customer, 400)  # a malformed list is refused, not a crash
call('/bookings', 'POST', {**payload, **described, 'hardAccessUnits': 4}, customer, 400)
call('/bookings', 'POST', {**payload, **described, 'symptoms': ['broken']}, customer, 400)
posted = call('/bookings', 'POST', {**payload, **described, 'lastCleaned': 'over1y', 'symptoms': ['smell', 'drip']}, customer, 201)
assert posted['unitCount'] == 3 and posted['service'] == 'ล้างธรรมดา แอร์ติดผนัง + ฝังฝ้า' and posted['price'] == estimate['range']['mid']
assert posted['market']['mid'] == estimate['range']['mid'] and posted['symptoms'] == ['smell', 'drip'] and posted['lastCleaned'] == 'over1y'
job_id = posted['id']
mine = 650 * 2 + 1200 + 250 + 300
seen = next(row for row in call('/technician-jobs?latitude=13.7563&longitude=100.5018&radiusKm=5', token=tech) if row['id'] == job_id)
assert seen['yourQuote'] == mine and len(seen['yourLines']) == 4 and seen['market'] and seen['priceLines'] is None
offered = call(f'/bookings/{job_id}/applications', 'POST', {}, tech)
assert offered['applicants'][0]['quote'] == mine and len(offered['applicants'][0]['lines']) == 4
call(f'/bookings/{job_id}/applications', 'POST', {}, other_tech)
assert len(call(f'/bookings/{job_id}', token=customer)['applicants']) == 2
picked = call(f'/bookings/{job_id}/confirm-technician', 'POST', {'technicianId': profile['id']}, customer)
assert picked['price'] == mine and picked['applicants'][0]['position'] in ('low', 'typical', 'high')
assert [x['kind'] for x in picked['priceLines']] == ['clean', 'clean', 'large', 'access']
# The chosen technician sees only their own offer, never who else offered or at what price.
for view in [call(f'/bookings/{job_id}', token=tech), next(row for row in call('/bookings', token=tech) if row['id'] == job_id)]:
    assert [x['technicianId'] for x in view['applicants']] == [profile['id']]
# A technician sees and offers only on jobs they do: one who cleans wall units only, without deep cleans, does not
# get a job with a cassette unit or a deep clean.
other_me = call('/technicians/me', token=other_tech)
other_patch = {'title': other_me['title'], 'area': other_me['area'], 'basePrice': other_me['prices']['wall'], 'availableText': other_me['availableText'],
               'skills': ', '.join(other_me['skills']), 'phone': other_me['phone'], 'prices': other_me['prices']}
assert call('/technicians/me', 'PATCH', {**other_patch, 'kinds': ['wall'], 'offersDeep': False}, other_tech)['kinds'] == ['wall']
cassette_job = call('/bookings', 'POST', {**payload, **described}, customer, 201)
deep_job = call('/bookings', 'POST', {**payload, 'items': [{'kind': 'wall', 'count': 1}], 'deep': True}, customer, 201)
wall_job = call('/bookings', 'POST', {**payload, 'items': [{'kind': 'wall', 'count': 1}]}, customer, 201)
other_feed = [row['id'] for row in call('/technician-jobs?latitude=13.7563&longitude=100.5018&radiusKm=5', token=other_tech)]
assert wall_job['id'] in other_feed and cassette_job['id'] not in other_feed and deep_job['id'] not in other_feed
call(f"/bookings/{cassette_job['id']}/applications", 'POST', {}, other_tech, 409)
call(f"/bookings/{deep_job['id']}/applications", 'POST', {}, other_tech, 409)
call('/technicians/me', 'PATCH', {**other_patch, 'kinds': ['wall', 'hanging', 'cassette'], 'offersDeep': True}, other_tech)
for row in [cassette_job, deep_job, wall_job]:
    call(f"/bookings/{row['id']}/status", 'PATCH', {'status': 'ยกเลิก'}, customer, 204)
for status in ['กำลังเดินทาง', 'ถึงหน้างาน', 'กำลังดำเนินการ']:
    call(f'/bookings/{job_id}/status', 'PATCH', {'status': status}, tech, 204)
# On site the units are not as described: the new price comes from the same list, and nothing changes until the customer says yes.
corrected = {'kind': 'correction', 'reason': 'เครื่องที่สามเป็นแบบแขวน ไม่ใช่ฝังฝ้า', 'items': [{'kind': 'wall', 'count': 2, 'large': 1}, {'kind': 'hanging', 'count': 1}], 'deep': False, 'hardAccessUnits': 1}
call(f'/bookings/{job_id}/changes', 'POST', corrected, other_tech, 403)
call(f'/bookings/{job_id}/changes', 'POST', {**corrected, 'items': described['items']}, tech, 400)
call(f'/bookings/{job_id}/changes', 'POST', {**corrected, 'reason': '     '}, tech, 400)
call(f'/bookings/{job_id}/changes', 'POST', {'kind': 'extra', 'reason': 'ต้องเติมน้ำยา', 'extras': [None]}, tech, 400)
asked = call(f'/bookings/{job_id}/changes', 'POST', corrected, tech)
change = asked['pendingChange']
assert change['oldPrice'] == mine and change['newPrice'] == 650 * 2 + 1000 + 250 + 300 and asked['price'] == mine
call(f'/bookings/{job_id}/changes', 'POST', corrected, tech, 409)
call(f"/bookings/{job_id}/changes/{change['id']}/answer", 'POST', {'approve': True}, other_customer, 403)
# While the customer has not answered, no way into "awaiting payment" is open: closing, the report, or the status step.
assert call(f'/bookings/{job_id}/complete', 'POST', {'method': 'Cash'}, tech, 409)['code'] == 'change_pending'
assert call('/service-reports', 'POST', {'bookingId': job_id, 'summary': 'ล้างครบ', 'cleanedFilter': True, 'cleanedCoil': True, 'checkedDrain': True, 'checkedCooling': True}, tech, 409)['code'] == 'change_pending'
assert call(f'/bookings/{job_id}/status', 'PATCH', {'status': 'รอชำระเงิน'}, tech, 409)['code'] == 'change_pending'
approved = call(f"/bookings/{job_id}/changes/{change['id']}/answer", 'POST', {'approve': True}, customer)
assert approved['price'] == change['newPrice'] and approved['pendingChange'] is None and approved['service'] == 'ล้างธรรมดา แอร์ติดผนัง + แขวน/ตั้งพื้น'
call(f"/bookings/{job_id}/changes/{change['id']}/answer", 'POST', {'approve': False}, customer, 409)
# Extra work names its own price and reason. Declined or withdrawn, the price stays as agreed.
extra = {'kind': 'extra', 'reason': 'น้ำยาเหลือน้อย วัดแรงดันได้ 60 psi', 'extras': [{'label': 'เติมน้ำยา R32', 'amount': 800}]}
call(f'/bookings/{job_id}/changes', 'POST', {**extra, 'extras': []}, tech, 400)
declined = call(f"/bookings/{job_id}/changes/{call(f'/bookings/{job_id}/changes', 'POST', extra, tech)['pendingChange']['id']}/answer", 'POST', {'approve': False}, customer)
assert declined['price'] == change['newPrice']
withdrawn = call(f'/bookings/{job_id}/changes', 'POST', extra, tech)['pendingChange']['id']
call(f'/bookings/{job_id}/changes/{withdrawn}', 'DELETE', None, other_tech, 403)
assert call(f'/bookings/{job_id}/changes/{withdrawn}', 'DELETE', None, tech)['pendingChange'] is None
call(f'/bookings/{job_id}/changes/{withdrawn}/answer', 'POST', {'approve': True}, customer, 409)
added = call(f"/bookings/{job_id}/changes/{call(f'/bookings/{job_id}/changes', 'POST', extra, tech)['pendingChange']['id']}/answer", 'POST', {'approve': True}, customer)
total = change['newPrice'] + 800
assert added['price'] == total and added['priceLines'][-1]['kind'] == 'extra' and len(added['changes']) == 4
# A job carries at most five requests, so a customer is not asked again and again.
call(f"/bookings/{job_id}/changes/{call(f'/bookings/{job_id}/changes', 'POST', extra, tech)['pendingChange']['id']}", 'DELETE', None, tech)
call(f'/bookings/{job_id}/changes', 'POST', extra, tech, 409)
call(f'/bookings/{job_id}/complete', 'POST', {'method': 'Cash'}, tech)
call(f'/bookings/{job_id}/payment-confirmation', 'PATCH', {'method': 'Cash', 'confirmed': True}, customer)
priced_receipt = call(f'/bookings/{job_id}/receipt', token=customer)
assert priced_receipt['total'] == total and sum(x['amount'] for x in priced_receipt['lines']) == total
assert priced_receipt['lines'][-1]['description'] == 'งานเพิ่ม: เติมน้ำยา R32'
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
# Saved addresses belong to the account, so every device sees the same list.
home = {'label': 'บ้าน', 'placeType': 'คอนโด', 'address': '99/1 ถนนทดสอบ', 'building': 'อาคาร A', 'floor': '8', 'room': '801',
        'note': 'แลกบัตรที่ รปภ.', 'latitude': 13.75, 'longitude': 100.5}
saved = call('/me/addresses', 'POST', home, customer)
assert call('/me/addresses', 'POST', {**home, 'address': '100/2 ถนนใหม่'}, customer)['id'] == saved['id']
assert [row['address'] for row in call('/me/addresses', token=customer)] == ['100/2 ถนนใหม่']
assert call('/me/addresses', token=other_customer) == []
call('/me/addresses', 'POST', {**home, 'placeType': 'ปราสาท'}, customer, 400)
call('/me/addresses', 'POST', {**home, 'latitude': 95}, customer, 400)
call(f"/me/addresses/{saved['id']}", 'DELETE', token=other_customer, expected=404)
call(f"/me/addresses/{saved['id']}", 'DELETE', token=customer, expected=204)
assert call('/me/addresses', token=customer) == []
# Two devices saving the same name at once keep a single entry.
with ThreadPoolExecutor(max_workers=4) as pool:
    list(pool.map(lambda _: call('/me/addresses', 'POST', {**home, 'label': 'พร้อมกัน'}, customer), range(4)))
assert len(call('/me/addresses', token=customer)) == 1
# Password reset: same answer for unknown accounts, single-use links, and older sessions end.
forgot_token, forgot_email = register('Customer')
assert call('/auth/forgot-password', 'POST', {'email': forgot_email})['message'] == call('/auth/forgot-password', 'POST', {'email': 'nobody' + suffix + '@example.test'})['message']
call('/admin/password-reset-links', 'POST', {'email': forgot_email}, customer, 403)
call('/admin/password-reset-links', 'POST', {'email': admin_email}, admin, 400)
link = call('/admin/password-reset-links', 'POST', {'email': forgot_email}, admin)['link']
reset_token = link.split('reset=')[1]
call('/auth/reset-password', 'POST', {'token': reset_token, 'newPassword': 'short'}, expected=400)
call('/auth/reset-password', 'POST', {'token': reset_token, 'newPassword': 'BrandNewPass456!'})
call('/auth/reset-password', 'POST', {'token': reset_token, 'newPassword': 'AnotherPass789!'}, expected=400)
call('/auth/me', token=forgot_token, expected=401)
call('/auth/login', 'POST', {'email': forgot_email, 'password': 'CiTestPass123!'}, expected=401)
fresh = call('/auth/login', 'POST', {'email': forgot_email, 'password': 'BrandNewPass456!'})['token']
call('/auth/change-password', 'POST', {'currentPassword': 'wrong-password', 'newPassword': 'ChangedPass789!'}, fresh, 400)
changed = call('/auth/change-password', 'POST', {'currentPassword': 'BrandNewPass456!', 'newPassword': 'ChangedPass789!'}, fresh)['token']
call('/auth/me', token=fresh, expected=401)
call('/auth/me', token=changed)
# Google sign-in, against a local identity provider (the API only trusts it outside production).
idp_port = os.environ.get('TEST_OIDC_PORT')
if idp_port:
    import sys
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from fake_oidc import FakeIdentityProvider
    idp = FakeIdentityProvider(int(idp_port))
    google_aud = os.environ['GOOGLE_CLIENT_ID']
    social_email = 'social' + suffix + '@example.test'
    picture = idp.issuer('google') + '/picture.png'
    google = lambda **kw: idp.token('google', google_aud, 'g-' + suffix, email=social_email, name='โซเชียล ทดสอบ', picture=picture, **kw)
    # Invalid tokens are refused: wrong signature, audience, issuer, expired, or an unknown provider.
    for bad in [google(wrong_key=True), idp.token('google', 'someone-else', 'g-' + suffix, email=social_email),
                google(issuer='http://evil.example'), google(expires_in=-600)]:
        call('/auth/external', 'POST', {'provider': 'google', 'idToken': bad}, expected=401)
    # Only Google is offered (Apple sign-in was dropped), so any other provider is refused.
    for other in ['facebook', 'apple']:
        call('/auth/external', 'POST', {'provider': other, 'idToken': google()}, expected=400)
    # Unknown account: the client is asked to pick a role, then the account is created and linked.
    ask = call('/auth/external', 'POST', {'provider': 'google', 'idToken': google()}, expected=404)
    assert ask['code'] == 'signup_required' and ask['email'] == social_email and ask['fullName'] == 'โซเชียล ทดสอบ'
    call('/auth/external', 'POST', {'provider': 'google', 'idToken': google(), 'createAccount': True, 'role': 'Technician'}, expected=400)
    created = call('/auth/external', 'POST', {'provider': 'google', 'idToken': google(), 'createAccount': True, 'role': 'Admin'}, expected=201)
    assert created['user']['role'] == 'Customer' and not created['user']['hasPassword'] and created['user']['providers'] == ['google']
    again = call('/auth/external', 'POST', {'provider': 'google', 'idToken': google()})
    assert again['user']['id'] == created['user']['id']
    # The Google picture became the profile photo, served from our own copy; it is fetched once, not at every sign-in.
    google_photo = created['user']['photoId']
    assert google_photo and again['user']['photoId'] == google_photo and idp.picture_requests == 1
    with urlopen(Request(f"{BASE}/profile-photos/{google_photo}"), timeout=20) as response:
        assert response.headers['Content-Type'] == 'image/png' and response.read()[:4] == b'\x89PNG'
    # A photo the person removed does not come back at the next Google sign-in.
    assert call('/me/photo', 'DELETE', None, again['token'])['photoId'] is None
    assert call('/auth/external', 'POST', {'provider': 'google', 'idToken': google()})['user']['photoId'] is None
    assert idp.picture_requests == 1
    # No password yet, so password sign-in fails; the user may set a first password without a current one.
    call('/auth/login', 'POST', {'email': social_email, 'password': 'anything-at-all'}, expected=401)
    with_password = call('/auth/change-password', 'POST', {'currentPassword': '', 'newPassword': 'SocialPass123!'}, again['token'])
    assert with_password['user']['hasPassword']
    call('/auth/login', 'POST', {'email': social_email, 'password': 'SocialPass123!'})
    call('/auth/change-password', 'POST', {'currentPassword': '', 'newPassword': 'Another123!'}, with_password['token'], 400)
    # Signing in with Google again keeps the password set since: the address was already proven by Google.
    relinked = call('/auth/external', 'POST', {'provider': 'google', 'idToken': google()})
    assert relinked['user']['id'] == created['user']['id'] and relinked['user']['hasPassword']
    call('/auth/login', 'POST', {'email': social_email, 'password': 'SocialPass123!'})
    # Someone registered an address that is not theirs: when its owner signs in with Google, the account becomes the
    # owner's alone. The squatter's password stops working and their session ends.
    squatter, squatted_email = register('Customer')
    owner = call('/auth/external', 'POST', {'provider': 'google', 'idToken': idp.token('google', google_aud, 'g-owner-' + suffix, email=squatted_email, picture=picture)})
    assert owner['user']['photoId'] and idp.picture_requests == 2
    assert not owner['user']['hasPassword'] and owner['user']['providers'] == ['google']
    call('/auth/login', 'POST', {'email': squatted_email, 'password': 'CiTestPass123!'}, expected=401)
    call('/auth/me', token=squatter, expected=401)
    call('/auth/me', token=owner['token'])
    # Someone signs up with their own Google account, then puts another person's address on it. When that person
    # signs in with Google, the account becomes theirs alone: the first Google login no longer gets in.
    planter_email = 'planter' + suffix + '@example.test'
    planted_email = 'planted' + suffix + '@example.test'
    planter = call('/auth/external', 'POST', {'provider': 'google', 'idToken': idp.token('google', google_aud, 'g-planter-' + suffix, email=planter_email), 'createAccount': True}, expected=201)
    call('/auth/profile', 'PATCH', {'fullName': 'ผู้ตั้งบัญชี', 'email': planted_email}, planter['token'])
    owner2 = call('/auth/external', 'POST', {'provider': 'google', 'idToken': idp.token('google', google_aud, 'g-planted-' + suffix, email=planted_email)})
    assert owner2['user']['id'] == planter['user']['id'] and owner2['user']['providers'] == ['google']
    call('/auth/me', token=planter['token'], expected=401)
    assert call('/auth/external', 'POST', {'provider': 'google', 'idToken': idp.token('google', google_aud, 'g-planter-' + suffix, email=planter_email)}, expected=404)['code'] == 'signup_required'
    # An unverified email never links to an existing password account.
    _, victim_email = register('Customer')
    sneaky = idp.token('google', google_aud, 'g-sneaky-' + suffix, email=victim_email, email_verified=False)
    assert call('/auth/external', 'POST', {'provider': 'google', 'idToken': sneaky}, expected=404)['code'] == 'signup_required'
    call('/auth/external', 'POST', {'provider': 'google', 'idToken': sneaky, 'createAccount': True}, expected=400)
    # Redirects are not followed, a page that is not an image is not kept, and other hosts are never fetched; the
    # sign-in itself still works. A redirect or bad file is tried again at the next sign-in.
    for n, bad_picture in enumerate([idp.issuer('google') + '/moved', idp.issuer('google') + '/page.html', 'http://127.0.0.1:' + os.environ.get('PORT', '5080') + '/api/health']):
        signed = call('/auth/external', 'POST', {'provider': 'google', 'idToken': idp.token('google', google_aud, f'g-pic{n}-' + suffix, email=f'pic{n}{suffix}@example.test', picture=bad_picture), 'createAccount': True}, expected=201)
        assert signed['user']['photoId'] is None
    assert idp.picture_requests == 2
    # Admin accounts stay password-only.
    admin_token = idp.token('google', google_aud, 'g-admin-' + suffix, email=admin_email)
    call('/auth/external', 'POST', {'provider': 'google', 'idToken': admin_token}, expected=409)
    # A technician signing up with Google applies like everyone else and starts pending.
    tech_email = 'google-tech' + suffix + '@example.test'
    tech_google = idp.token('google', google_aud, 'g-tech-' + suffix, email=tech_email)
    applied = call('/auth/external', 'POST', {'provider': 'google', 'idToken': tech_google, 'createAccount': True, 'role': 'technician',
                                               'fullName': 'ช่าง กูเกิล', 'phone': '0899999999', 'serviceArea': 'บางนา', 'experienceYears': 2}, expected=201)
    assert applied['user']['fullName'] == 'ช่าง กูเกิล'
    assert call('/technicians/me', token=applied['token'])['verificationStatus'] == 'Pending'
# Email through Brevo's HTTPS API, against a local stand-in (BREVO_API_URL), as used on hosts that block SMTP.
brevo_port = os.environ.get('TEST_BREVO_PORT')
if brevo_port:
    import threading
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
    sent = []
    class Brevo(BaseHTTPRequestHandler):
        def do_POST(self):
            body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
            ok = self.path == '/v3/smtp/email' and self.headers.get('api-key') == os.environ['BREVO_API_KEY'] and 'reject' not in body['to'][0]['email']
            if ok:
                sent.append(body)
            self.send_response(201 if ok else 400)
            self.send_header('Content-Type', 'application/json'); self.end_headers()
            self.wfile.write(b'{"messageId":"ci"}' if ok else b'{"code":"invalid_parameter","message":"recipient rejected"}')
        def log_message(self, *args):
            pass
    threading.Thread(target=ThreadingHTTPServer(('127.0.0.1', int(brevo_port)), Brevo).serve_forever, daemon=True).start()
    call('/admin/test-email', 'POST', {'email': 'ops@example.test'}, customer, 403)
    ok = call('/admin/test-email', 'POST', {'email': 'ops@example.test'}, admin)
    assert ok['transport'] == 'Brevo API' and sent[-1]['to'] == [{'email': 'ops@example.test'}] and sent[-1]['sender']['email'] == os.environ['SMTP_FROM']
    failed = call('/admin/test-email', 'POST', {'email': 'reject@example.test'}, admin, 502)
    assert 'recipient rejected' in failed['message']
    mail_token, mail_email = register('Customer')
    call('/auth/forgot-password', 'POST', {'email': mail_email})
    for _ in range(50):
        if any(item['to'][0]['email'] == mail_email for item in sent):
            break
        time.sleep(0.1)
    reset_mail = next(item for item in sent if item['to'][0]['email'] == mail_email)
    assert '?reset=' in reset_mail['textContent']
    # Job notifications: each step emails the person who needs to act, and the opt-out is honoured.
    # Job events reach people through the bell (and push), never by email.
    emails_before = len(sent)
    def notice(token, title_part, timeout=5.0):
        deadline = time.time() + timeout
        while time.time() < deadline:
            found = [item for item in call('/notifications', token=token)['items'] if title_part in item['title']]
            if found:
                return found[0]
            time.sleep(0.15)
        raise AssertionError(f'no notification about {title_part!r}; got {[i["title"] for i in call("/notifications", token=token)["items"][:6]]}')
    n_customer, n_customer_email = register('Customer')
    n_tech, n_tech_email = register('Technician')
    n_other, n_other_email = register('Technician')
    n_profile = call('/technicians/me', token=n_tech)
    n_other_profile = call('/technicians/me', token=n_other)
    call(f"/technicians/{n_other_profile['id']}/verification", 'PATCH', {'verified': False, 'note': 'ทดสอบเหตุผล'}, admin)
    assert 'ทดสอบเหตุผล' in notice(n_other, 'ยังไม่ผ่าน')['body']
    for token, row in [(n_tech, n_profile), (n_other, n_other_profile)]:
        send_id(token)
        call(f"/technicians/{row['id']}/verification", 'PATCH', {'verified': True}, admin)
    notice(admin, 'มีช่างสมัครใหม่')
    notice(n_tech, 'ได้รับการอนุมัติ')
    job = call('/bookings', 'POST', {**payload, 'address': 'NOTIFY-HOUSE-9'}, n_customer, 201)
    call(f"/bookings/{job['id']}/applications", 'POST', {}, n_tech)
    call(f"/bookings/{job['id']}/applications", 'POST', {}, n_other)
    assert job['code'] in notice(n_customer, 'มีช่างเสนอราคา')['title']
    # A technician's own offers appear in "my jobs" right away, still without the customer's address.
    offered = next(row for row in call('/bookings', token=n_tech) if row['id'] == job['id'])
    assert offered['status'] == 'รอเลือกช่าง' and 'NOTIFY-HOUSE' not in json.dumps(offered)
    assert [a['technicianId'] for a in offered['applicants']] == [n_profile['id']]
    call(f"/bookings/{job['id']}/confirm-technician", 'POST', {'technicianId': n_profile['id']}, n_customer)
    assert 'NOTIFY-HOUSE-9' in notice(n_tech, 'ลูกค้ายืนยัน')['body']
    assert next(row for row in call('/bookings', token=n_tech) if row['id'] == job['id'])['address'] == 'NOTIFY-HOUSE-9'
    notice(n_other, 'เลือกช่างท่านอื่น')
    assert all(row['id'] != job['id'] for row in call('/bookings', token=n_other))
    call(f"/bookings/{job['id']}/status", 'PATCH', {'status': 'กำลังเดินทาง'}, n_tech, 204)
    notice(n_customer, 'กำลังเดินทาง')
    call(f"/bookings/{job['id']}/status", 'PATCH', {'status': 'ถึงหน้างาน'}, n_tech, 204)
    notice(n_customer, 'ช่างมาถึงแล้ว')
    # One step at the end: done and paid. Report, payment, history and counts are recorded together.
    jobs_before = call('/technicians/me', token=n_tech)['jobsCompleted']
    call(f"/bookings/{job['id']}/complete", 'POST', {'method': 'Bitcoin'}, n_tech, 400)
    call(f"/bookings/{job['id']}/complete", 'POST', {'method': 'Cash'}, n_customer, 403)
    call(f"/bookings/{job['id']}/complete", 'POST', {'method': 'Cash'}, n_other, 403)
    # The technician's "done and paid" waits for the customer: confirm, dispute, or it closes by itself after 3 days.
    closed = call(f"/bookings/{job['id']}/complete", 'POST', {'method': 'PromptPay', 'summary': 'ล้างครบ 2 เครื่อง'}, n_tech)
    assert closed['status'] == 'รอชำระเงิน' and closed['paymentMethod'] == 'PromptPay' and closed['technicianConfirmedPayment'] and not closed['customerConfirmedPayment']
    assert 'ยืนยัน' in notice(n_customer, 'ยืนยันการจ่ายเงิน')['body']
    call(f"/bookings/{job['id']}/complete", 'POST', {'method': 'Cash'}, n_tech, 409)
    assert call('/technicians/me', token=n_tech)['jobsCompleted'] == jobs_before
    closed = call(f"/bookings/{job['id']}/payment-confirmation", 'PATCH', {'method': 'PromptPay', 'confirmed': True}, n_customer)
    assert closed['status'] == 'เสร็จสิ้น' and closed['paymentStatus'] == 'Paid'
    assert call('/technicians/me', token=n_tech)['jobsCompleted'] == jobs_before + 1
    report_row = next(r for r in call('/service-reports', token=n_customer) if r['bookingId'] == job['id'])
    assert report_row['summary'] == 'ล้างครบ 2 เครื่อง' and report_row['cleanedFilter']
    # Straight from "confirmed" works too (the technician never pressed travelling or arrived).
    direct = call('/bookings', 'POST', payload, n_customer, 201)
    call(f"/bookings/{direct['id']}/applications", 'POST', {}, n_tech)
    call(f"/bookings/{direct['id']}/confirm-technician", 'POST', {'technicianId': n_profile['id']}, n_customer)
    assert call(f"/bookings/{direct['id']}/complete", 'POST', {'method': 'Cash'}, n_tech)['status'] == 'รอชำระเงิน'
    # The customer disputes instead: the technician's earlier "paid" no longer counts and an admin decides.
    disputed = call(f"/bookings/{direct['id']}/payment-issue", 'POST', {'reason': 'ยังไม่ได้จ่ายเงิน ช่างกดปิดงานก่อน'}, n_customer)
    assert disputed['status'] == 'มีปัญหาการชำระเงิน' and not disputed['technicianConfirmedPayment']
    assert call(f"/bookings/{direct['id']}/payment-confirmation", 'PATCH', {'method': 'Cash', 'confirmed': True}, n_tech)['status'] == 'มีปัญหาการชำระเงิน'
    assert next(r for r in call('/service-reports', token=n_customer) if r['bookingId'] == direct['id'])['summary']
    # After the job the customer can rate, and flag a problem for the admin.
    call(f"/bookings/{job['id']}/reviews", 'POST', {'rating': 5, 'comment': 'ดีมาก'}, n_customer, 201)
    call(f"/bookings/{job['id']}/report-problem", 'POST', {'reason': 'ล้างแล้วน้ำยังหยด'}, n_other, 403)
    call(f"/bookings/{job['id']}/report-problem", 'POST', {'reason': 'ล้างแล้วน้ำยังหยด'}, other_customer, 404)
    call(f"/bookings/{job['id']}/report-problem", 'POST', {'reason': 'ล้างแล้วน้ำยังหยด'}, n_customer, 204)
    assert 'น้ำยังหยด' in notice(admin, 'แจ้งปัญหางาน')['body']
    # Cancelling a confirmed job tells the technician.
    quiet = call('/bookings', 'POST', payload, n_customer, 201)
    call(f"/bookings/{quiet['id']}/applications", 'POST', {}, n_tech)
    call(f"/bookings/{quiet['id']}/report-problem", 'POST', {'reason': 'ยังไม่เสร็จ'}, n_customer, 409)
    call(f"/bookings/{quiet['id']}/confirm-technician", 'POST', {'technicianId': n_profile['id']}, n_customer)
    call(f"/bookings/{quiet['id']}/status", 'PATCH', {'status': 'ยกเลิก'}, n_customer, 204)
    notice(n_tech, 'ลูกค้ายกเลิกงาน')
    time.sleep(1)
    assert len(sent) == emails_before, [item['subject'] for item in sent[emails_before:]]
# In-app notifications (the bell): list, read state, links.
if brevo_port:
    feed = call('/notifications', token=n_customer)
    offer = next(item for item in feed['items'] if item['title'].startswith('มีช่างเสนอราคา') and item['bookingId'] == quiet['id'])
    assert offer['target'] == 'bookings' and not offer['read'] and feed['unread'] >= 1
    assert all(item['bookingId'] != quiet['id'] for item in call('/notifications', token=n_tech)['items'] if item['title'].startswith('มีช่างเสนอราคา'))
    call('/notifications/read', 'POST', {'ids': [offer['id']]}, n_customer, 204)
    after = call('/notifications', token=n_customer)
    assert next(item for item in after['items'] if item['id'] == offer['id'])['read'] and after['unread'] == feed['unread'] - 1
    call('/notifications/read', 'POST', {}, n_customer, 204)
    assert call('/notifications', token=n_customer)['unread'] == 0
    approvals = [item for item in call('/notifications', token=admin)['items'] if item['title'].startswith('มีช่างสมัครใหม่')]
    assert approvals and approvals[0]['target'] == 'approvals'
# Web Push: the server encrypts for the browser's key and signs with VAPID; gone devices are dropped.
push_port = os.environ.get('TEST_PUSH_PORT')
if push_port:
    import sys
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from fake_push import FakePushService
    pusher = FakePushService(int(push_port))
    p_customer, _ = register('Customer')
    p_tech, _ = register('Technician')
    vapid_key = call('/push/public-key', token=p_customer)['publicKey']
    call('/push/test', 'POST', {}, p_customer, 409)
    phone = pusher.subscribe('phone')
    call('/push/subscriptions', 'POST', {**phone, 'p256dh': 'bad'}, p_customer, 400)
    call('/push/subscriptions', 'POST', {**phone, 'endpoint': 'ftp://example.test/x'}, p_customer, 400)
    call('/push/subscriptions', 'POST', phone, p_customer, 204)
    laptop = pusher.subscribe('laptop')
    call('/push/subscriptions', 'POST', laptop, p_customer, 204)
    p_profile = call('/technicians/me', token=p_tech)
    send_id(p_tech)
    call(f"/technicians/{p_profile['id']}/verification", 'PATCH', {'verified': True}, admin)
    p_job = call('/bookings', 'POST', payload, p_customer, 201)
    call(f"/bookings/{p_job['id']}/applications", 'POST', {}, p_tech)
    for _ in range(50):
        if len([m for m in pusher.received if 'payload' in m]) >= 2:
            break
        time.sleep(0.1)
    errors = [m for m in pusher.received if 'error' in m]
    assert not errors, errors
    delivered = {m['path']: m for m in pusher.received}
    assert set(delivered) == {'/push/phone', '/push/laptop'}, delivered.keys()
    message = delivered['/push/phone']
    assert message['payload']['title'].startswith('มีช่างเสนอราคา') and message['payload']['url'].endswith(f"/?job={p_job['id']}")
    assert message['headers']['content-encoding'] == 'aes128gcm' and int(message['headers']['ttl']) > 0
    FakePushService.verify_vapid(message['headers']['authorization'], vapid_key, phone['endpoint'])
    # A device the push service reports as gone is removed; the other one still receives.
    pusher.gone.add('/push/phone')
    pusher.received.clear()
    assert '2 อุปกรณ์' in call('/push/test', 'POST', {}, p_customer)['message']
    for _ in range(50):
        if any(m.get('path') == '/push/laptop' for m in pusher.received):
            break
        time.sleep(0.1)
    assert call('/push/test', 'POST', {}, p_customer)['message'].count('1 อุปกรณ์') == 1
    call('/push/subscriptions/remove', 'POST', {'endpoint': laptop['endpoint']}, p_customer, 204)
    call('/push/test', 'POST', {}, p_customer, 409)
# Reported issues: admins see payment disputes and customer reports, contact both sides, and close them.
def awaiting_payment():
    row = call('/bookings', 'POST', payload, customer, 201)
    call(f"/bookings/{row['id']}/applications", 'POST', {}, tech)
    call(f"/bookings/{row['id']}/confirm-technician", 'POST', {'technicianId': profile['id']}, customer)
    for step in ['กำลังเดินทาง', 'ถึงหน้างาน', 'กำลังดำเนินการ']:
        call(f"/bookings/{row['id']}/status", 'PATCH', {'status': step}, tech, 204)
    call('/service-reports', 'POST', {**report, 'bookingId': row['id']}, tech, 201)
    return row['id']
def open_issue(booking_id):
    return next((row for row in call('/admin/issues', token=admin) if row['bookingId'] == booking_id), None)
call('/admin/issues', token=customer, expected=403)
disputed = awaiting_payment()
call(f'/bookings/{disputed}/payment-issue', 'POST', {'reason': 'ลูกค้าบอกโอนแล้วแต่ยังไม่เข้า'}, tech)
issue = open_issue(disputed)
assert issue and issue['issue']['kind'] == 'Payment' and issue['issue']['open'] and issue['issue']['reportedBy'] == 'ช่าง'
assert 'ยังไม่เข้า' in issue['issue']['reason'] and issue['technician']['phone'] and issue['customer']['email'] and issue['address']
assert call(f'/bookings/{disputed}', token=customer)['issue']['open']
call(f'/admin/issues/{disputed}/resolve', 'POST', {'action': 'paid'}, tech, 403)
call(f'/admin/issues/{disputed}/resolve', 'POST', {'action': 'close', 'note': 'x'}, admin, 400)
call(f'/admin/issues/{disputed}/resolve', 'POST', {'action': 'paid', 'method': 'Bitcoin'}, admin, 400)
jobs_before = call('/technicians/me', token=tech)['jobsCompleted']
paid = call(f'/admin/issues/{disputed}/resolve', 'POST', {'action': 'paid', 'method': 'PromptPay', 'note': 'ตรวจสลิปแล้ว'}, admin)
assert paid['status'] == 'เสร็จสิ้น' and paid['paymentStatus'] == 'Paid' and paid['paymentMethod'] == 'PromptPay'
assert paid['issue']['resolution'] == 'Paid' and not paid['issue']['open']
assert call('/technicians/me', token=tech)['jobsCompleted'] == jobs_before + 1
assert open_issue(disputed) is None
assert any(row['bookingId'] == disputed for row in call('/admin/issues?status=resolved', token=admin))
call(f'/admin/issues/{disputed}/resolve', 'POST', {'action': 'paid'}, admin, 409)
# A dispute can end in cancellation (a note is required), and a later report after completion is closed with a note.
cancelled = awaiting_payment()
call(f'/bookings/{cancelled}/payment-issue', 'POST', {'reason': 'ไม่ได้รับเงิน'}, customer)
call(f'/admin/issues/{cancelled}/resolve', 'POST', {'action': 'cancel'}, admin, 400)
assert call(f'/admin/issues/{cancelled}/resolve', 'POST', {'action': 'cancel', 'note': 'ตกลงยกเลิก'}, admin)['status'] == 'ยกเลิก'
call(f'/bookings/{disputed}/report-problem', 'POST', {'reason': 'แอร์ยังมีกลิ่น'}, customer, 204)
call(f'/bookings/{disputed}/report-problem', 'POST', {'reason': 'ซ้ำ'}, customer, 409)
service = open_issue(disputed)
assert service and service['issue']['kind'] == 'Service' and service['issue']['reason'] == 'แอร์ยังมีกลิ่น'
call(f'/admin/issues/{disputed}/resolve', 'POST', {'action': 'paid'}, admin, 400)
closed_issue = call(f'/admin/issues/{disputed}/resolve', 'POST', {'action': 'close', 'note': 'ช่างกลับไปล้างซ้ำแล้ว'}, admin)
assert closed_issue['issue']['resolutionNote'] == 'ช่างกลับไปล้างซ้ำแล้ว' and closed_issue['status'] == 'เสร็จสิ้น'
assert open_issue(disputed) is None
# Both sides confirming payment settles an open dispute without the admin.
settled = awaiting_payment()
call(f'/bookings/{settled}/payment-issue', 'POST', {'reason': 'ยังไม่แน่ใจ'}, customer)
call(f'/bookings/{settled}/payment-confirmation', 'PATCH', {'method': 'Cash', 'confirmed': True}, customer)
call(f'/bookings/{settled}/payment-confirmation', 'PATCH', {'method': 'Cash', 'confirmed': True}, tech)
assert open_issue(settled) is None and call(f'/bookings/{settled}', token=customer)['issue']['resolution'] == 'Paid'
# Disputes recorded before issues were stored still show up.
if os.environ.get('MONGODB_URI'):
    legacy = awaiting_payment()
    call(f'/bookings/{legacy}/payment-issue', 'POST', {'reason': 'เก่า'}, tech)
    MongoClient(os.environ['MONGODB_URI'])[os.environ.get('MONGODB_DATABASE', 'airclean_ci')].bookings.update_one({'_id': legacy}, {'$unset': {'Issue': ''}})
    assert open_issue(legacy)['issue']['reason'] == 'เก่า'
    assert call(f'/admin/issues/{legacy}/resolve', 'POST', {'action': 'paid'}, admin)['issue']['resolution'] == 'Paid'
# Job photos: the job's technician uploads (images only, size and count limited); the customer and admins see them.
import base64
photo_job = awaiting_payment()
jpeg = base64.b64encode(b'\xff\xd8\xff\xe0' + b'\x00' * 2000).decode()
call(f'/bookings/{photo_job}/photos', 'POST', {'kind': 'after', 'data': base64.b64encode(b'<svg/>').decode()}, tech, 400)
call(f'/bookings/{photo_job}/photos', 'POST', {'kind': 'side', 'data': jpeg}, tech, 400)
call(f'/bookings/{photo_job}/photos', 'POST', {'kind': 'after', 'data': jpeg}, other_tech, 403)
call(f'/bookings/{photo_job}/photos', 'POST', {'kind': 'after', 'data': jpeg}, customer, 403)
before = call(f'/bookings/{photo_job}/photos', 'POST', {'kind': 'before', 'data': 'data:image/jpeg;base64,' + jpeg}, tech, 201)
after = call(f'/bookings/{photo_job}/photos', 'POST', {'kind': 'after', 'data': jpeg}, tech, 201)
assert [p['kind'] for p in call(f'/bookings/{photo_job}/photos', token=customer)] == ['before', 'after']
call(f'/bookings/{photo_job}/photos', token=other_customer, expected=403)
assert len(call(f'/bookings/{photo_job}/photos', token=admin)) == 2
req = Request(BASE + f"/photos/{after['id']}", headers={'Authorization': 'Bearer ' + customer})
with urlopen(req, timeout=20) as response:
    assert response.headers['Content-Type'] == 'image/jpeg' and response.read()[:3] == b'\xff\xd8\xff'
call(f"/photos/{after['id']}", token=other_customer, expected=403)
call(f"/photos/{before['id']}", 'DELETE', token=other_tech, expected=404)
call(f"/photos/{before['id']}", 'DELETE', token=tech, expected=204)
for _ in range(7):
    call(f'/bookings/{photo_job}/photos', 'POST', {'kind': 'after', 'data': jpeg}, tech, 201)
call(f'/bookings/{photo_job}/photos', 'POST', {'kind': 'after', 'data': jpeg}, tech, 409)
# Admin view of one technician: profile, contact, totals, jobs (with photo counts) and reviews.
call(f"/admin/technicians/{profile['id']}", token=customer, expected=403)
detail = call(f"/admin/technicians/{profile['id']}", token=admin)
assert detail['profile']['phone'] and detail['profile']['email'] and detail['stats']['jobsCompleted'] >= 1
assert detail['stats']['revenueTotal'] > 0 and detail['reviews'] and detail['reviews'][0]['rating'] in range(1, 6)
assert next(job for job in detail['jobs'] if job['id'] == photo_job)['photos'] == 8
call('/admin/technicians/999999', token=admin, expected=404)
# A time window instead of one time: it starts at the scheduled time and is shown to the technician.
visit_day = (datetime.now() + timedelta(days=3)).strftime('%Y-%m-%d')
windowed = call('/bookings', 'POST', {**payload, 'scheduledAt': visit_day + 'T12:00:00', 'timeWindow': '12:00-17:00'}, customer, 201)
assert windowed['timeWindow'] == '12:00-17:00' and windowed['time'] == '12:00'
call(f"/bookings/{windowed['id']}/applications", 'POST', {}, tech)
assert next(row for row in call('/bookings', token=tech) if row['id'] == windowed['id'])['timeWindow'] == '12:00-17:00'
for bad in ['13:00-17:00', '17:00-12:00', 'afternoon']:
    call('/bookings', 'POST', {**payload, 'scheduledAt': visit_day + 'T12:00:00', 'timeWindow': bad}, customer, 400)
assert call('/bookings', 'POST', {**payload, 'scheduledAt': visit_day + 'T14:30:00'}, customer, 201)['timeWindow'] is None
# Building managers: a saved building with its unit count and on-site contact, a whole-building job,
# notes the technician sees only after being chosen, and unit-by-unit progress.
manager = account('Manager')
building = call('/me/addresses', 'POST', {'label': 'คอนโด A', 'placeType': 'คอนโด', 'address': 'BUILDING-A-ADDRESS', 'building': 'คอนโด A',
                'latitude': 13.7563, 'longitude': 100.5018, 'unitCount': 48, 'contactName': 'คุณสมศรี', 'contactPhone': '081-111-2222'}, manager)
assert building['unitCount'] == 48 and building['contactName'] == 'คุณสมศรี'
call('/me/addresses', 'POST', {'label': 'x', 'placeType': 'ปราสาท', 'address': 'x', 'latitude': 1, 'longitude': 1}, manager, 400)
call('/bookings', 'POST', {**payload, 'unitCount': 31}, customer, 400)
call('/bookings', 'POST', {**payload, 'unitCount': 40, 'placeId': building['id']}, customer, 400)
whole = call('/bookings', 'POST', {**payload, 'unitCount': 48, 'placeId': building['id'], 'address': 'BUILDING-A-ADDRESS',
             'notes': 'ผู้ติดต่อหน้างาน: คุณสมศรี โทร 081-111-2222\nห้อง 101-148'}, manager, 201)
assert whole['unitCount'] == 48 and whole['placeId'] == building['id'] and 'สมศรี' in whole['notes']
call(f"/bookings/{whole['id']}/applications", 'POST', {}, tech)
offer_view = next(row for row in call('/bookings', token=tech) if row['id'] == whole['id'])
assert offer_view['notes'] is None and offer_view['placeId'] is None and 'BUILDING-A' not in json.dumps(offer_view)
call(f"/bookings/{whole['id']}/confirm-technician", 'POST', {'technicianId': profile['id']}, manager)
assert 'ห้อง 101-148' in call(f"/bookings/{whole['id']}", token=tech)['notes']
call(f"/bookings/{whole['id']}/progress", 'POST', {'unitsDone': 5}, other_tech, 403)
call(f"/bookings/{whole['id']}/progress", 'POST', {'unitsDone': 5}, manager, 403)
progressed = call(f"/bookings/{whole['id']}/progress", 'POST', {'unitsDone': 20}, tech)
assert progressed['unitsDone'] == 20 and progressed['status'] == 'กำลังดำเนินการ'
assert call(f"/bookings/{whole['id']}", token=manager)['unitsDone'] == 20
assert call(f"/bookings/{whole['id']}/progress", 'POST', {'unitsDone': 300}, tech)['unitsDone'] == 48
finished_whole = call(f"/bookings/{whole['id']}/complete", 'POST', {'method': 'PromptPay'}, tech)
assert finished_whole['unitsDone'] == 48 and finished_whole['status'] == 'รอชำระเงิน'
finished_whole = call(f"/bookings/{whole['id']}/payment-confirmation", 'PATCH', {'method': 'PromptPay', 'confirmed': True}, manager)
assert finished_whole['status'] == 'เสร็จสิ้น'
call(f"/bookings/{whole['id']}/progress", 'POST', {'unitsDone': 1}, tech, 409)
call(f"/bookings/{whole['id']}/reviews", 'POST', {'rating': 5, 'comment': 'ทีมงานดี'}, manager, 201)
# Buildings with a room list: rooms are picked when booking, decide the unit count, and are ticked off one by one.
roomy = call('/me/addresses', 'POST', {'label': 'คอนโด B', 'placeType': 'คอนโด', 'address': 'BUILDING-B', 'latitude': 13.75, 'longitude': 100.5,
             'rooms': [{'name': '201', 'units': 1}, {'name': '202', 'units': 2}, {'name': '202', 'units': 1}, {'name': 'ล็อบบี้', 'units': 3}]}, manager)
assert [r['name'] for r in roomy['rooms']] == ['201', '202', 'ล็อบบี้'] and roomy['unitCount'] == 6
call('/me/addresses', 'POST', {'label': 'ใหญ่', 'placeType': 'คอนโด', 'address': 'x', 'latitude': 1, 'longitude': 1,
     'rooms': [{'name': str(1000 + i)} for i in range(501)]}, manager, 400)
call('/bookings', 'POST', {**payload, 'rooms': ['201']}, manager, 400)
call('/bookings', 'POST', {**payload, 'placeId': roomy['id'], 'rooms': ['999']}, manager, 400)
by_room = call('/bookings', 'POST', {**payload, 'unitCount': 1, 'placeId': roomy['id'], 'rooms': ['202', 'ล็อบบี้']}, manager, 201)
assert by_room['unitCount'] == 5 and [r['name'] for r in by_room['rooms']] == ['202', 'ล็อบบี้'] and not any(r['done'] for r in by_room['rooms'])
call(f"/bookings/{by_room['id']}/applications", 'POST', {}, tech)
assert next(row for row in call('/bookings', token=tech) if row['id'] == by_room['id'])['rooms'] is None
call(f"/bookings/{by_room['id']}/confirm-technician", 'POST', {'technicianId': profile['id']}, manager)
# A job cleaned by room keeps its number of units: a correction may change their kinds only.
room_fix = {'kind': 'correction', 'reason': 'ล็อบบี้เป็นแอร์ฝังฝ้า', 'deep': False, 'hardAccessUnits': 0}
call(f"/bookings/{by_room['id']}/changes", 'POST', {**room_fix, 'items': [{'kind': 'wall', 'count': 2}, {'kind': 'cassette', 'count': 1}]}, tech, 400)
room_change = call(f"/bookings/{by_room['id']}/changes", 'POST', {**room_fix, 'items': [{'kind': 'wall', 'count': 3}, {'kind': 'cassette', 'count': 2}]}, tech)['pendingChange']
call(f"/bookings/{by_room['id']}/changes/{room_change['id']}", 'DELETE', None, tech)
ticked = call(f"/bookings/{by_room['id']}/progress", 'POST', {'roomsDone': ['ล็อบบี้', 'unknown']}, tech)
assert ticked['unitsDone'] == 3 and [r['done'] for r in ticked['rooms']] == [False, True]
assert call(f"/bookings/{by_room['id']}/progress", 'POST', {'roomsDone': []}, tech)['unitsDone'] == 0
closed_rooms = call(f"/bookings/{by_room['id']}/complete", 'POST', {'method': 'Cash'}, tech)
assert all(r['done'] for r in closed_rooms['rooms']) and closed_rooms['unitsDone'] == 5
assert call(f"/bookings/{by_room['id']}/payment-confirmation", 'PATCH', {'method': 'Cash', 'confirmed': True}, manager)['status'] == 'เสร็จสิ้น'
# Receipts: issued once by the customer for a paid job, in their name or a company's, with a running number.
call(f"/bookings/{whole['id']}/receipt", token=other_customer, expected=403)
draft = call(f"/bookings/{whole['id']}/receipt", token=manager)
assert not draft['issued'] and draft['number'] is None and draft['total'] == finished_whole['price'] and draft['lines'][0]['quantity'] == 48
call(f"/bookings/{whole['id']}/receipt", 'POST', {'payer': {'name': 'บริษัท ทดสอบ จำกัด', 'taxId': '123'}}, manager, 400)
call(f"/bookings/{whole['id']}/receipt", 'POST', {'payer': {'name': 'x'}}, tech, 403)
issued = call(f"/bookings/{whole['id']}/receipt", 'POST', {'payer': {'name': 'นิติบุคคลอาคารชุด เอ', 'taxId': '0105561234567', 'branch': 'สำนักงานใหญ่', 'address': 'กรุงเทพฯ'}}, manager, 201)
assert issued['issued'] and issued['number'].startswith('RC') and issued['payer']['taxId'] == '0105561234567'
again = call(f"/bookings/{whole['id']}/receipt", 'POST', {'payer': {'name': 'อื่น'}}, manager)
assert again['number'] == issued['number'] and again['payer']['name'] == 'นิติบุคคลอาคารชุด เอ'
assert call(f"/bookings/{whole['id']}/receipt", token=tech)['number'] == issued['number']
assert call(f"/bookings/{by_room['id']}/receipt", token=manager)['payer']['name'] == 'นิติบุคคลอาคารชุด เอ'
second = call(f"/bookings/{by_room['id']}/receipt", 'POST', {'payer': {'name': 'นิติบุคคลอาคารชุด เอ', 'taxId': '0105561234567'}}, manager, 201)
assert second['number'] != issued['number'] and second['rooms'] == ['202', 'ล็อบบี้']
unpaid = call('/bookings', 'POST', payload, customer, 201)
call(f"/bookings/{unpaid['id']}/receipt", token=customer, expected=409)
# Rescheduling: people agree a new time by phone, then either side changes it and the other side is told.
later = (datetime.now() + timedelta(days=5)).strftime('%Y-%m-%d')
no_phone = account('Customer')
call('/bookings', 'POST', {**payload, 'contactPhone': None}, no_phone, 400)
call('/bookings', 'POST', {**payload, 'contactPhone': 'โทรมา'}, no_phone, 400)
call('/bookings', 'POST', {**payload, 'contactPhone': '089-555-1212'}, no_phone, 201)
assert call('/auth/me', token=no_phone)['phone'] == '089-555-1212'
assert call('/bookings', 'POST', {**payload, 'contactPhone': None}, no_phone, 201)['customerPhone'] == '089-555-1212'
moved = call('/bookings', 'POST', payload, customer, 201)
call(f"/bookings/{moved['id']}/applications", 'POST', {}, tech)
offer_seen = next(row for row in call('/bookings', token=tech) if row['id'] == moved['id'])
assert offer_seen['customerPhone'] is None and offer_seen['technicianPhone'] is None
call(f"/bookings/{moved['id']}/reschedule", 'POST', {'scheduledAt': later + 'T13:00:00', 'timeWindow': '13:00-17:00'}, tech, 403)
call(f"/bookings/{moved['id']}/reschedule", 'POST', {'scheduledAt': later + 'T13:00:00', 'timeWindow': '12:00-17:00'}, customer, 400)
call(f"/bookings/{moved['id']}/reschedule", 'POST', {'scheduledAt': '2020-01-01T10:00:00'}, customer, 400)
direct_move = call(f"/bookings/{moved['id']}/reschedule", 'POST', {'scheduledAt': later + 'T13:00:00', 'timeWindow': '13:00-17:00'}, customer)
assert direct_move['date'] == later and direct_move['timeWindow'] == '13:00-17:00'
confirmed_move = call(f"/bookings/{moved['id']}/confirm-technician", 'POST', {'technicianId': profile['id']}, customer)
assert confirmed_move['technicianPhone'] == call('/technicians/me', token=tech)['phone']
assert call(f"/bookings/{moved['id']}", token=tech)['customerPhone'] == '081-000-0000'
call(f"/bookings/{moved['id']}/reschedule", 'POST', {'scheduledAt': later + 'T09:00:00'}, other_customer, 403)
by_customer = call(f"/bookings/{moved['id']}/reschedule", 'POST', {'scheduledAt': later + 'T09:00:00'}, customer)
assert by_customer['time'] == '09:00' and by_customer['timeWindow'] is None
next_day = (datetime.now() + timedelta(days=6)).strftime('%Y-%m-%d')
by_tech = call(f"/bookings/{moved['id']}/reschedule", 'POST', {'scheduledAt': next_day + 'T08:00:00', 'timeWindow': '08:00-12:00'}, tech)
assert by_tech['date'] == next_day and by_tech['timeWindow'] == '08:00-12:00'
assert 'เปลี่ยนวันนัด' in notice(customer, 'ช่างเปลี่ยนวันนัด')['title'] if brevo_port else True
call(f"/bookings/{moved['id']}/status", 'PATCH', {'status': 'กำลังเดินทาง'}, tech, 204)
call(f"/bookings/{moved['id']}/reschedule", 'POST', {'scheduledAt': next_day + 'T15:00:00'}, customer, 409)
# A technician can cancel a confirmed job they cannot do; the customer is told.
dropped = call('/bookings', 'POST', payload, customer, 201)
call(f"/bookings/{dropped['id']}/applications", 'POST', {}, tech)
call(f"/bookings/{dropped['id']}/confirm-technician", 'POST', {'technicianId': profile['id']}, customer)
call(f"/bookings/{dropped['id']}/status", 'PATCH', {'status': 'ยกเลิก'}, tech, 204)
assert call(f"/bookings/{dropped['id']}", token=customer)['status'] == 'ยกเลิก'

# ── Technician documents: only the technician and admins can open them. ──
def raw(path, token, expected=200):
    req = Request(BASE + path, headers={'Authorization': 'Bearer ' + token})
    try:
        with urlopen(req, timeout=20) as response:
            status, data = response.status, response.read()
    except HTTPError as error:
        status, data = error.code, error.read()
    assert status == expected, f'GET {path}: expected {expected}, got {status}'
    return data
docs = call('/technicians/me/documents', token=tech)
assert [d['kind'] for d in docs] == ['idcard']
assert raw(f"/technician-documents/{docs[0]['id']}", tech)[:3] == b'\xff\xd8\xff'
raw(f"/technician-documents/{docs[0]['id']}", admin)
raw(f"/technician-documents/{docs[0]['id']}", other_tech, 403)
raw(f"/technician-documents/{docs[0]['id']}", customer, 403)
call('/technicians/me/documents', 'POST', {'kind': 'passport', 'data': TINY_JPEG}, tech, 400)
call('/technicians/me/documents', 'POST', {'kind': 'selfie', 'data': 'data:text/plain;base64,aGVsbG8='}, tech, 400)
for _ in range(2):
    call('/technicians/me/documents', 'POST', {'kind': 'selfie', 'data': TINY_JPEG}, tech, 201)
for _ in range(3):
    call('/technicians/me/documents', 'POST', {'kind': 'certificate', 'data': TINY_JPEG}, tech, 201)
call('/technicians/me/documents', 'POST', {'kind': 'certificate', 'data': TINY_JPEG}, tech, 409)
kinds = [d['kind'] for d in call(f"/admin/technicians/{profile['id']}/documents", token=admin)]
assert kinds.count('selfie') == 1 and kinds.count('certificate') == 3
call(f"/admin/technicians/{profile['id']}/documents", token=tech, expected=403)
cert = next(d for d in call('/technicians/me/documents', token=tech) if d['kind'] == 'certificate')
call(f"/technicians/me/documents/{cert['id']}", 'DELETE', None, other_tech, 404)
call(f"/technicians/me/documents/{cert['id']}", 'DELETE', None, tech, 204)

# ── Profile photos: any role can set one; it loads by its random id and is copied onto the technician's offers and jobs. ──
def public_photo(photo_id, expected=200):
    try:
        with urlopen(Request(f"{BASE}/profile-photos/{photo_id}"), timeout=20) as response:
            assert response.status == expected and 'immutable' in response.headers.get('Cache-Control', '')
            return response.read()
    except HTTPError as error:
        assert error.code == expected, f'GET profile photo: expected {expected}, got {error.code}'
call('/me/photo', 'PUT', {'data': TINY_JPEG}, None, 401)
call('/me/photo', 'PUT', {'data': 'data:text/plain;base64,aGVsbG8='}, customer, 400)
assert call('/me/photo', 'PUT', {'data': TINY_JPEG}, customer)['photoId']
first = call('/me/photo', 'PUT', {'data': TINY_JPEG}, tech)['photoId']
assert len(first) == 32 and call('/auth/me', token=tech)['photoId'] == first
assert public_photo(first)[:3] == b'\xff\xd8\xff'
assert call('/technicians/me', token=tech)['photoId'] == first
job = call(f"/bookings/{dropped['id']}", token=customer)
assert job['technicianPhotoId'] == first and [a['photoId'] for a in job['applicants'] if a['technicianId'] == profile['id']] == [first]
second = call('/me/photo', 'PUT', {'data': TINY_JPEG}, tech)['photoId']
assert second != first and call(f"/bookings/{dropped['id']}", token=customer)['technicianPhotoId'] == second
public_photo(first, 404)
assert call('/me/photo', 'DELETE', None, tech)['photoId'] is None
public_photo(second, 404)
assert call(f"/bookings/{dropped['id']}", token=customer)['technicianPhotoId'] is None

# ── Membership: a free trial on approval, pay by PromptPay slip, the admin approves, and offers stop when it runs out. ──
mine = call('/technicians/me/membership', token=tech)
assert mine['state'] == 'Trial' and 25 <= mine['daysLeft'] <= 31 and mine['pending'] is None
call('/technicians/me/membership', token=customer, expected=403)
call('/admin/membership/settings', 'PUT', {'monthlyFee': 199, 'trialDays': 30, 'promptPayId': '12345', 'payeeName': 'AirClean'}, admin, 400)
call('/admin/membership/settings', 'PUT', {'monthlyFee': 199, 'trialDays': 30, 'promptPayId': '081-234-5678', 'payeeName': 'AirClean'}, tech, 403)
saved_settings = call('/admin/membership/settings', 'PUT', {'monthlyFee': 199, 'trialDays': 30, 'promptPayId': '081-234-5678', 'payeeName': 'AirClean'}, admin)
assert saved_settings['promptPayId'] == '0812345678'
assert call('/technicians/me/membership', token=tech)['monthlyFee'] == 199
call('/technicians/me/membership/payments', 'POST', {'months': 13, 'slip': TINY_JPEG}, tech, 400)
before_until = datetime.fromisoformat(call('/technicians/me/membership', token=tech)['memberUntil'].replace('Z', '+00:00'))
slipok_port = os.environ.get('TEST_SLIP2GO_PORT')
if slipok_port:
    # A stand-in for Slip2Go. The slip image carries a marker saying how the bank would answer.
    import base64, re, threading
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
    slip_calls = []
    class Slip2Go(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass
        def do_POST(self):
            body = self.rfile.read(int(self.headers['Content-Length']))
            slip_calls.append(body)
            def answer(status, data):
                raw_answer = json.dumps(data).encode()
                self.send_response(status); self.send_header('Content-Type', 'application/json'); self.end_headers(); self.wfile.write(raw_answer)
            if self.headers.get('Authorization') != 'ci-slip2go-secret' or self.path != '/api/verify-slip/qr-image/info':
                return answer(401, {'code': '401000', 'message': 'Unauthorized'})
            conditions = json.loads(re.search(rb'name=payload\r\n(?:Content-Type: [^\r]*\r\n)?\r\n(\{.*?\})\r\n--', body.replace(b'"payload"', b'payload'), re.S).group(1))
            assert conditions['checkDuplicate'] is True and conditions['checkReceiver'] == [{'accountType': '02001', 'accountNumber': '0812345678'}], conditions
            assert conditions['checkAmount']['type'] == 'eq' and conditions['checkDate']['type'] == 'gte', conditions
            for marker, code in [(b'NOTSLIP', '400001'), (b'DUPLICATE', '200501'), (b'WRONGAMOUNT', '200402'), (b'WRONGRECEIVER', '200401'), (b'FAKE', '200500')]:
                if marker in body:
                    return answer(200, {'code': code, 'message': marker.decode()})
            if b'WAITONCE' in body and sum(b'WAITONCE' in call_body for call_body in slip_calls) == 1 or b'WAITALWAYS' in body:
                return answer(200, {'code': '200404', 'message': 'Slip not found.'})
            reference = 'SAMEREF-1' if b'SAMEREF' in body else uuid.uuid4().hex
            answer(200, {'code': '200200', 'message': 'Slip is valid.', 'data': {'transRef': reference, 'amount': float(conditions['checkAmount']['amount']),
                                                                               'dateTime': datetime.now(timezone.utc).isoformat()}})
    threading.Thread(target=ThreadingHTTPServer(('127.0.0.1', int(slipok_port)), Slip2Go).serve_forever, daemon=True).start()
    def slip_with(marker=b''):
        return 'data:image/jpeg;base64,' + base64.b64encode(b'\xff\xd8\xff\xe0' + b'0' * 16 + marker).decode()
    assert call('/technicians/me/membership', token=tech)['autoCheck']
    # A real transfer of the right amount is approved at once, without an admin.
    slip = call('/technicians/me/membership/payments', 'POST', {'months': 2, 'slip': slip_with()}, tech, 201)
    assert slip['amount'] == 398 and slip['status'] == 'Approved' and slip['checkedBy'] == 'auto', slip
    assert b'"amount":"398"' in slip_calls[-1]
    covered = datetime.fromisoformat(slip['coveredUntil'].replace('Z', '+00:00'))
    assert 58 <= (covered - before_until).days <= 62
    assert call('/technicians/me/membership', token=tech)['state'] == 'Active'
    raw(f"/membership/payments/{slip['id']}/slip", admin)
    raw(f"/membership/payments/{slip['id']}/slip", tech)
    raw(f"/membership/payments/{slip['id']}/slip", other_tech, 403)
    # Fakes, reused slips and wrong amounts or receivers are turned down with the reason.
    for marker, reason in [(b'NOTSLIP', 'ไม่พบ QR'), (b'DUPLICATE', 'เคยถูกใช้'), (b'WRONGAMOUNT', 'ไม่ตรง'), (b'WRONGRECEIVER', 'บัญชีผู้รับ'), (b'FAKE', 'ไม่ยืนยัน')]:
        turned_down = call('/technicians/me/membership/payments', 'POST', {'months': 1, 'slip': slip_with(marker)}, tech, 201)
        assert turned_down['status'] == 'Rejected' and reason in turned_down['note'], turned_down
    # One bank transaction pays once, even if the slip service did not flag it.
    assert call('/technicians/me/membership/payments', 'POST', {'months': 1, 'slip': slip_with(b'SAMEREF-a')}, tech, 201)['status'] == 'Approved'
    # The very same picture is refused before it is even checked.
    call('/technicians/me/membership/payments', 'POST', {'months': 1, 'slip': slip_with(b'SAMEREF-a')}, tech, 409)
    reused = call('/technicians/me/membership/payments', 'POST', {'months': 1, 'slip': slip_with(b'SAMEREF-b')}, tech, 201)
    assert reused['status'] == 'Rejected' and 'เคยใช้' in reused['note']
    # The bank has not confirmed yet: it waits (one slip at a time), and an admin can still decide by hand.
    waiting = call('/technicians/me/membership/payments', 'POST', {'months': 1, 'slip': slip_with(b'WAITALWAYS')}, tech, 201)
    assert waiting['status'] == 'Pending' and waiting['checkError']
    call('/technicians/me/membership/payments', 'POST', {'months': 1, 'slip': slip_with()}, tech, 409)
    board = call('/admin/membership', token=admin)
    assert board['autoCheck'] and board['payments'][0]['id'] == waiting['id'] and any(m['technicianId'] == profile['id'] for m in board['members'])
    call(f"/admin/membership/payments/{waiting['id']}/review", 'POST', {'approve': False}, admin, 400)
    assert call(f"/admin/membership/payments/{waiting['id']}/review", 'POST', {'approve': True}, admin)['checkedBy'] == 'admin'
    call(f"/admin/membership/payments/{waiting['id']}/review", 'POST', {'approve': True}, admin, 409)
else:
    # Without the slip service, every slip waits for an admin.
    slip = call('/technicians/me/membership/payments', 'POST', {'months': 2, 'slip': TINY_JPEG}, tech, 201)
    assert slip['amount'] == 398 and slip['status'] == 'Pending'
    call('/technicians/me/membership/payments', 'POST', {'months': 1, 'slip': TINY_JPEG}, tech, 409)
    raw(f"/membership/payments/{slip['id']}/slip", admin)
    raw(f"/membership/payments/{slip['id']}/slip", other_tech, 403)
    call(f"/admin/membership/payments/{slip['id']}/review", 'POST', {'approve': False}, admin, 400)
    approved = call(f"/admin/membership/payments/{slip['id']}/review", 'POST', {'approve': True}, admin)
    covered = datetime.fromisoformat(approved['coveredUntil'].replace('Z', '+00:00'))
    assert 58 <= (covered - before_until).days <= 62
    call(f"/admin/membership/payments/{slip['id']}/review", 'POST', {'approve': True}, admin, 409)
    assert call('/technicians/me/membership', token=tech)['state'] == 'Active'
if os.environ.get('MONGODB_URI'):
    from pymongo import MongoClient
    db = MongoClient(os.environ['MONGODB_URI'])[os.environ.get('MONGODB_DATABASE', 'airclean_ci')]
    db.technicians.update_one({'_id': other_profile['id']}, {'$set': {'MemberUntil': datetime.now(timezone.utc) - timedelta(days=1)}})
    lapsed_job = call('/bookings', 'POST', payload, customer, 201)
    lapsed = call(f"/bookings/{lapsed_job['id']}/applications", 'POST', {}, other_tech, 402)
    assert lapsed['code'] == 'membership_expired'
    assert call('/technicians/me/membership', token=other_tech)['state'] == 'Expired'
    call(f"/admin/technicians/{other_profile['id']}/membership/grant", 'POST', {'days': 7}, admin)
    call(f"/bookings/{lapsed_job['id']}/applications", 'POST', {}, other_tech)

    # ── Reminders, run by the scheduler hook as if it were a chosen Thai time. ──
    cron_key = os.environ.get('CRON_KEY')
    if cron_key:
        def cron(at):
            req = Request(BASE + '/cron/reminders?at=' + at, data=b'', method='POST', headers={'X-Cron-Key': cron_key})
            with urlopen(req, timeout=20) as response:
                return json.loads(response.read())
        try:
            urlopen(Request(BASE + '/cron/reminders', data=b'', method='POST', headers={'X-Cron-Key': 'wrong'}), timeout=20)
            raise AssertionError('wrong cron key accepted')
        except HTTPError as error:
            assert error.code == 401
        visit_day = (datetime.now() + timedelta(days=4)).strftime('%Y-%m-%d')
        r_customer = account('Customer')
        visit = call('/bookings', 'POST', {**payload, 'scheduledAt': visit_day + 'T13:00:00', 'timeWindow': '13:00-17:00'}, r_customer, 201)
        call(f"/bookings/{visit['id']}/applications", 'POST', {}, tech)
        call(f"/bookings/{visit['id']}/confirm-technician", 'POST', {'technicianId': profile['id']}, r_customer)
        db.bookings.update_one({'_id': visit['id']}, {'$set': {'CreatedAt': datetime.now(timezone.utc) - timedelta(days=10)}})
        eve = (datetime.now() + timedelta(days=3)).strftime('%Y-%m-%d')
        cron(eve + 'T16:00:00')
        time.sleep(0.3)
        assert not any('พรุ่งนี้' in i['title'] for i in call('/notifications', token=r_customer)['items'])
        assert cron(eve + 'T18:00:00')['visits'] >= 1
        def titles(token):
            for _ in range(40):
                items = [i['title'] for i in call('/notifications', token=token)['items']]
                if items:
                    return items
                time.sleep(0.1)
            return []
        assert any('พรุ่งนี้ช่างจะมาล้างแอร์' in t for t in titles(r_customer)), titles(r_customer)
        cron(eve + 'T19:00:00')
        time.sleep(0.5)
        assert sum('พรุ่งนี้ช่างจะมาล้างแอร์' in t for t in titles(r_customer)) == 1
        assert cron(eve + 'T23:00:00')['quiet']
        # A job the technician closed as paid, with no confirmation or dispute from the customer, closes after 3 days.
        auto_job = call('/bookings', 'POST', payload, r_customer, 201)
        call(f"/bookings/{auto_job['id']}/applications", 'POST', {}, tech)
        call(f"/bookings/{auto_job['id']}/confirm-technician", 'POST', {'technicianId': profile['id']}, r_customer)
        assert call(f"/bookings/{auto_job['id']}/complete", 'POST', {'method': 'Cash'}, tech)['status'] == 'รอชำระเงิน'
        cron((datetime.now() + timedelta(days=1)).strftime('%Y-%m-%d') + 'T10:00:00')
        assert call(f"/bookings/{auto_job['id']}", token=r_customer)['status'] == 'รอชำระเงิน'
        cron((datetime.now() + timedelta(days=4)).strftime('%Y-%m-%d') + 'T10:00:00')
        assert call(f"/bookings/{auto_job['id']}", token=r_customer)['status'] == 'เสร็จสิ้น'
        # Six months after the last cleaning at a place, with nothing booked there.
        me = call('/auth/me', token=r_customer)
        db.bookings.insert_one({'_id': 990000 + int(time.time()) % 9999, 'Code': 'OLD-1', 'CustomerId': me['id'], 'Status': 'Completed', 'Address': 'OLD-HOUSE-1',
                                'ScheduledAt': datetime.now(timezone.utc) - timedelta(days=200), 'CreatedAt': datetime.now(timezone.utc) - timedelta(days=210),
                                'UpdatedAt': datetime.now(timezone.utc) - timedelta(days=200), 'Events': [], 'Applicants': [], 'Rooms': []})
        today = datetime.now().strftime('%Y-%m-%d')
        assert cron(today + 'T10:00:00')['cleaningDue'] >= 1
        assert cron(today + 'T10:30:00')['cleaningDue'] == 0
        assert any('ถึงรอบล้างแอร์' in t for t in titles(r_customer))
        # A technician whose membership ends within three days is told once.
        db.technicians.update_one({'_id': other_profile['id']}, {'$set': {'MemberUntil': datetime.now(timezone.utc) + timedelta(days=2)}})
        assert cron(today + 'T11:00:00')['membership'] >= 1
        cron(today + 'T11:30:00')
        time.sleep(0.5)
        assert sum('ใกล้หมดอายุ' in t for t in titles(other_tech)) == 1
        # A slip the bank had not confirmed is checked again a few minutes later and approved.
        if slipok_port:
            later_slip = call('/technicians/me/membership/payments', 'POST', {'months': 1, 'slip': slip_with(b'WAITONCE')}, tech, 201)
            assert later_slip['status'] == 'Pending'
            cron((datetime.now(timezone.utc) + timedelta(hours=7, minutes=10)).strftime('%Y-%m-%dT%H:%M:%S'))
            assert next(p for p in call('/technicians/me/membership', token=tech)['history'] if p['id'] == later_slip['id'])['status'] == 'Approved'

    # ── The hour to pick a technician, counted from the first offer. ──
    t_customer = account('Customer')
    timed = call('/bookings', 'POST', payload, t_customer, 201)
    assert timed['offerDeadline'] is None
    first = call(f"/bookings/{timed['id']}/applications", 'POST', {}, tech)
    deadline = datetime.fromisoformat(call(f"/bookings/{timed['id']}", token=t_customer)['offerDeadline'].replace('Z', '+00:00'))
    assert 55 <= (deadline - datetime.now(timezone.utc)).total_seconds() / 60 <= 61
    call(f"/bookings/{timed['id']}/applications", 'POST', {}, other_tech)
    assert datetime.fromisoformat(call(f"/bookings/{timed['id']}", token=t_customer)['offerDeadline'].replace('Z', '+00:00')) == deadline
    if cron_key:
        db.bookings.update_one({'_id': timed['id']}, {'$set': {'OfferDeadline': datetime.now(timezone.utc) + timedelta(minutes=12)}})
        assert cron((datetime.now(timezone.utc) + timedelta(hours=7)).strftime('%Y-%m-%dT%H:%M:%S'))['offerWarnings'] >= 1
    db.bookings.update_one({'_id': timed['id']}, {'$set': {'OfferDeadline': datetime.now(timezone.utc) - timedelta(minutes=1)}})
    lapsed_offer = call(f"/bookings/{timed['id']}", token=t_customer)
    assert lapsed_offer['status'] == 'หมดเวลาเลือกช่าง'
    assert call(f"/bookings/{timed['id']}/confirm-technician", 'POST', {'technicianId': profile['id']}, t_customer, 409)['code'] == 'offers_expired'
    assert not any(row['id'] == timed['id'] for row in call('/bookings', token=tech))
    call(f"/bookings/{timed['id']}/applications", 'POST', {}, tech, 409)
    for _ in range(40):
        if any('ลูกค้าไม่ได้เลือกช่าง' in i['title'] for i in call('/notifications', token=tech)['items']):
            break
        time.sleep(0.1)
    else:
        raise AssertionError('technician not told the offers lapsed')
    # Open it again: the offers are cleared and the next offer starts a new hour.
    call(f"/bookings/{timed['id']}/reopen", 'POST', {}, customer, 403)
    reopened = call(f"/bookings/{timed['id']}/reopen", 'POST', {}, t_customer)
    assert reopened['status'] == 'เปิดรับช่าง' and reopened['applicants'] == [] and reopened['offerDeadline'] is None
    call(f"/bookings/{timed['id']}/reopen", 'POST', {}, t_customer, 409)
    call(f"/bookings/{timed['id']}/applications", 'POST', {}, tech)
    assert call(f"/bookings/{timed['id']}", token=t_customer)['offerDeadline']
    # An expired request can be cancelled; one whose date has passed needs a new date before opening again.
    db.bookings.update_one({'_id': timed['id']}, {'$set': {'OfferDeadline': datetime.now(timezone.utc) - timedelta(minutes=1)}})
    call(f"/bookings/{timed['id']}", token=t_customer)
    db.bookings.update_one({'_id': timed['id']}, {'$set': {'ScheduledAt': datetime.now(timezone.utc) - timedelta(days=2)}})
    assert call(f"/bookings/{timed['id']}/reopen", 'POST', {}, t_customer, 409)['code'] == 'date_passed'
    call(f"/bookings/{timed['id']}/status", 'PATCH', {'status': 'ยกเลิก'}, t_customer, 204)
print('Marketplace API checks passed: privacy, ownership, quotes, status, reports, payment, reviews, passport, technician approval, saved addresses, password reset, email, in-app and push notifications, Google sign-in, reported issues, job photos, technician details, time windows, building managers, building rooms, receipts, rescheduling and cancellation, technician documents, profile photos, membership, automatic slip checks, reminders and the hour to pick a technician.')
