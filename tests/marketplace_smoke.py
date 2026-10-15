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
# Technician sign-up is an application: contact details are required and the account starts pending.
call('/auth/register', 'POST', {'fullName': 'ไม่มีเบอร์', 'email': uuid.uuid4().hex + '@example.test', 'password': 'CiTestPass123!', 'role': 'Technician', 'serviceArea': 'บางเขน'}, expected=400)
call('/auth/register', 'POST', {'fullName': 'ไม่มีพื้นที่', 'email': uuid.uuid4().hex + '@example.test', 'password': 'CiTestPass123!', 'role': 'Technician', 'phone': '0812345678'}, expected=400)
tech = account('Technician')
other_tech = account('technician')
profile = call('/technicians/me', token=tech)
assert profile['verificationStatus'] == 'Pending' and not profile['verified'] and profile['phone'] == '081-234-5678'
call('/technicians/me', token=customer, expected=403)
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
for row in [profile, call('/technicians/me', token=other_tech)]:
    assert call(f"/technicians/{row['id']}/verification", 'PATCH', {'verified': True}, admin)['verificationStatus'] == 'Approved'
assert call('/technicians/me', token=tech)['verified']
assert any(row['id'] == profile['id'] for row in call('/technicians'))
call('/technicians/999999/verification', 'PATCH', {'verified': True}, admin, 404)
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
# Saved addresses belong to the account, so every device sees the same list.
home = {'label': 'บ้าน', 'placeType': 'คอนโด', 'address': '99/1 ถนนทดสอบ', 'building': 'อาคาร A', 'floor': '8', 'room': '801',
        'note': 'แลกบัตรที่ รปภ.', 'latitude': 13.75, 'longitude': 100.5}
saved = call('/me/addresses', 'POST', home, customer)
assert call('/me/addresses', 'POST', {**home, 'address': '100/2 ถนนใหม่'}, customer)['id'] == saved['id']
assert [row['address'] for row in call('/me/addresses', token=customer)] == ['100/2 ถนนใหม่']
assert call('/me/addresses', token=other_customer) == []
call('/me/addresses', 'POST', {**home, 'placeType': 'โรงแรม'}, customer, 400)
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
# Google and Apple sign-in, against a local identity provider (the API only trusts it outside production).
idp_port = os.environ.get('TEST_OIDC_PORT')
if idp_port:
    import sys
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from fake_oidc import FakeIdentityProvider
    idp = FakeIdentityProvider(int(idp_port))
    google_aud, apple_aud = os.environ['GOOGLE_CLIENT_ID'], os.environ['APPLE_CLIENT_ID']
    social_email = 'social' + suffix + '@example.test'
    google = lambda **kw: idp.token('google', google_aud, 'g-' + suffix, email=social_email, name='โซเชียล ทดสอบ', **kw)
    # Invalid tokens are refused: wrong signature, audience, issuer, expired, or an unknown provider.
    for bad in [google(wrong_key=True), idp.token('google', 'someone-else', 'g-' + suffix, email=social_email),
                google(issuer='http://evil.example'), google(expires_in=-600)]:
        call('/auth/external', 'POST', {'provider': 'google', 'idToken': bad}, expected=401)
    call('/auth/external', 'POST', {'provider': 'facebook', 'idToken': google()}, expected=400)
    # Unknown account: the client is asked to pick a role, then the account is created and linked.
    ask = call('/auth/external', 'POST', {'provider': 'google', 'idToken': google()}, expected=404)
    assert ask['code'] == 'signup_required' and ask['email'] == social_email and ask['fullName'] == 'โซเชียล ทดสอบ'
    call('/auth/external', 'POST', {'provider': 'google', 'idToken': google(), 'createAccount': True, 'role': 'Technician'}, expected=400)
    created = call('/auth/external', 'POST', {'provider': 'google', 'idToken': google(), 'createAccount': True, 'role': 'Admin'}, expected=201)
    assert created['user']['role'] == 'Customer' and not created['user']['hasPassword'] and created['user']['providers'] == ['google']
    again = call('/auth/external', 'POST', {'provider': 'google', 'idToken': google()})
    assert again['user']['id'] == created['user']['id']
    # No password yet, so password sign-in fails; the user may set a first password without a current one.
    call('/auth/login', 'POST', {'email': social_email, 'password': 'anything-at-all'}, expected=401)
    with_password = call('/auth/change-password', 'POST', {'currentPassword': '', 'newPassword': 'SocialPass123!'}, again['token'])
    assert with_password['user']['hasPassword']
    call('/auth/login', 'POST', {'email': social_email, 'password': 'SocialPass123!'})
    call('/auth/change-password', 'POST', {'currentPassword': '', 'newPassword': 'Another123!'}, with_password['token'], 400)
    # Apple with the same verified email links to the same account.
    apple_token = idp.token('apple', apple_aud, 'a-' + suffix, email=social_email)
    linked = call('/auth/external', 'POST', {'provider': 'apple', 'idToken': apple_token})
    assert linked['user']['id'] == created['user']['id'] and sorted(linked['user']['providers']) == ['apple', 'google']
    # An unverified email never links to an existing password account.
    _, victim_email = register('Customer')
    sneaky = idp.token('apple', apple_aud, 'a-sneaky-' + suffix, email=victim_email, email_verified=False)
    assert call('/auth/external', 'POST', {'provider': 'apple', 'idToken': sneaky}, expected=404)['code'] == 'signup_required'
    call('/auth/external', 'POST', {'provider': 'apple', 'idToken': sneaky, 'createAccount': True}, expected=400)
    # Admin accounts stay password-only.
    admin_token = idp.token('google', google_aud, 'g-admin-' + suffix, email=admin_email)
    call('/auth/external', 'POST', {'provider': 'google', 'idToken': admin_token}, expected=409)
    # A technician signing up with Apple applies like everyone else and starts pending.
    tech_email = 'apple-tech' + suffix + '@example.test'
    tech_apple = idp.token('apple', apple_aud, 'a-tech-' + suffix, email=tech_email)
    applied = call('/auth/external', 'POST', {'provider': 'apple', 'idToken': tech_apple, 'createAccount': True, 'role': 'technician',
                                               'fullName': 'ช่าง แอปเปิล', 'phone': '0899999999', 'serviceArea': 'บางนา', 'experienceYears': 2}, expected=201)
    assert applied['user']['fullName'] == 'ช่าง แอปเปิล'
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
    def mail_to(address, subject_part, timeout=5.0):
        deadline = time.time() + timeout
        while time.time() < deadline:
            found = [item for item in sent if item['to'][0]['email'] == address and subject_part in item['subject']]
            if found:
                return found[-1]
            time.sleep(0.1)
        raise AssertionError(f'no email to {address} about {subject_part!r}; got {[(i["to"][0]["email"], i["subject"]) for i in sent[-8:]]}')
    n_customer, n_customer_email = register('Customer')
    n_tech, n_tech_email = register('Technician')
    n_other, n_other_email = register('Technician')
    mail_to(admin_email, 'มีช่างสมัครใหม่')
    n_profile = call('/technicians/me', token=n_tech)
    n_other_profile = call('/technicians/me', token=n_other)
    call(f"/technicians/{n_other_profile['id']}/verification", 'PATCH', {'verified': False, 'note': 'ทดสอบเหตุผล'}, admin)
    assert 'ทดสอบเหตุผล' in mail_to(n_other_email, 'ยังไม่ผ่าน')['textContent']
    for row in [n_profile, n_other_profile]:
        call(f"/technicians/{row['id']}/verification", 'PATCH', {'verified': True}, admin)
    mail_to(n_tech_email, 'ได้รับการอนุมัติ')
    job = call('/bookings', 'POST', {**payload, 'address': 'NOTIFY-HOUSE-9'}, n_customer, 201)
    call(f"/bookings/{job['id']}/applications", 'POST', {}, n_tech)
    call(f"/bookings/{job['id']}/applications", 'POST', {}, n_other)
    assert job['code'] in mail_to(n_customer_email, 'มีช่างเสนอราคา')['subject']
    call(f"/bookings/{job['id']}/confirm-technician", 'POST', {'technicianId': n_profile['id']}, n_customer)
    assert 'NOTIFY-HOUSE-9' in mail_to(n_tech_email, 'ลูกค้ายืนยัน')['textContent']
    mail_to(n_other_email, 'เลือกช่างท่านอื่น')
    call(f"/bookings/{job['id']}/status", 'PATCH', {'status': 'กำลังเดินทาง'}, n_tech, 204)
    mail_to(n_customer_email, 'กำลังเดินทาง')
    for status in ['ถึงหน้างาน', 'กำลังดำเนินการ']:
        call(f"/bookings/{job['id']}/status", 'PATCH', {'status': status}, n_tech, 204)
    call('/service-reports', 'POST', {'bookingId': job['id'], 'summary': 'เรียบร้อย', 'cleanedFilter': True, 'cleanedCoil': True, 'checkedDrain': True, 'checkedCooling': True}, n_tech, 201)
    assert 'เก็บเงินปลายทาง' in mail_to(n_customer_email, 'ล้างแอร์เสร็จแล้ว')['textContent']
    for token in [n_customer, n_tech]:
        call(f"/bookings/{job['id']}/payment-confirmation", 'PATCH', {'method': 'Cash', 'confirmed': True}, token)
    mail_to(n_customer_email, 'งานเสร็จสมบูรณ์')
    mail_to(n_tech_email, 'งานเสร็จสมบูรณ์')
    # A customer who turns emails off gets none; cancelling a confirmed job tells the technician.
    me = call('/auth/me', token=n_customer)
    assert me['emailNotifications'] is True
    assert call('/auth/profile', 'PATCH', {'fullName': me['fullName'], 'email': me['email'], 'emailNotifications': False}, n_customer)['emailNotifications'] is False
    quiet = call('/bookings', 'POST', payload, n_customer, 201)
    call(f"/bookings/{quiet['id']}/applications", 'POST', {}, n_tech)
    call(f"/bookings/{quiet['id']}/confirm-technician", 'POST', {'technicianId': n_profile['id']}, n_customer)
    call(f"/bookings/{quiet['id']}/status", 'PATCH', {'status': 'ยกเลิก'}, n_customer, 204)
    mail_to(n_tech_email, 'ลูกค้ายกเลิกงาน')
    time.sleep(1)
    assert not [item for item in sent if item['to'][0]['email'] == n_customer_email and quiet['code'] in item['subject']]
print('Marketplace API checks passed: privacy, ownership, quotes, status, reports, payment, reviews, passport, technician approval, saved addresses, password reset, email delivery and job notifications, Google/Apple sign-in and cancellation.')
