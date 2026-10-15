"""A stand-in browser and push service for tests: it subscribes like a browser, receives Web Push requests,
checks the VAPID signature and decrypts the aes128gcm payload (RFC 8291), so the server's encryption is
verified independently of the server's own code."""
import base64
import hashlib
import hmac
import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def b64d(text):
    return base64.urlsafe_b64decode(text + '=' * (-len(text) % 4))


def b64e(data):
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode()


def hkdf(salt, ikm, info, length):
    prk = hmac.new(salt, ikm, hashlib.sha256).digest()
    return hmac.new(prk, info + b'\x01', hashlib.sha256).digest()[:length]


class FakePushService:
    def __init__(self, port):
        self.port = port
        self.received = []          # decrypted messages with their headers
        self.gone = set()           # endpoint paths that answer 410 Gone
        self.browsers = {}          # path -> (private key, auth secret)
        service = self

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                body = self.rfile.read(int(self.headers['Content-Length']))
                path = self.path
                if path in service.gone:
                    self.send_response(410); self.end_headers(); return
                try:
                    message = service.decrypt(path, body)
                    message['headers'] = {k.lower(): v for k, v in self.headers.items()}
                    service.received.append(message)
                    self.send_response(201)
                except Exception as error:  # report to the test
                    service.received.append({'error': repr(error), 'path': path})
                    self.send_response(400)
                self.end_headers()

            def log_message(self, *args):
                pass

        self.server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def subscribe(self, name):
        """Returns the JSON a browser's PushSubscription would give the app."""
        key = ec.generate_private_key(ec.SECP256R1())
        auth = os.urandom(16)
        path = '/push/' + name
        self.browsers[path] = (key, auth)
        public = key.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
        return {'endpoint': f'http://localhost:{self.port}{path}', 'p256dh': b64e(public), 'auth': b64e(auth)}

    def decrypt(self, path, body):
        key, auth = self.browsers[path]
        salt, record_size, id_len = body[:16], int.from_bytes(body[16:20], 'big'), body[20]
        server_public = body[21:21 + id_len]
        ciphertext = body[21 + id_len:]
        assert record_size >= len(ciphertext), 'record larger than rs'
        ua_public = key.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
        shared = key.exchange(ec.ECDH(), ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), server_public))
        ikm = hkdf(auth, shared, b'WebPush: info\x00' + ua_public + server_public, 32)
        cek = hkdf(salt, ikm, b'Content-Encoding: aes128gcm\x00', 16)
        nonce = hkdf(salt, ikm, b'Content-Encoding: nonce\x00', 12)
        plain = AESGCM(cek).decrypt(nonce, ciphertext, None).rstrip(b'\x00')
        assert plain.endswith(b'\x02'), 'missing last-record delimiter'
        return {'path': path, 'payload': json.loads(plain[:-1])}

    @staticmethod
    def verify_vapid(authorization, expected_public_key, endpoint):
        """Checks the 'vapid t=JWT, k=KEY' header: key matches, audience is the push origin, signature valid."""
        parts = dict(item.strip().split('=', 1) for item in authorization[len('vapid '):].split(','))
        assert parts['k'] == expected_public_key, 'VAPID key differs from /push/public-key'
        header, claims, signature = parts['t'].split('.')
        claim = json.loads(b64d(claims))
        assert claim['aud'] == endpoint.split('/push/')[0], claim
        assert claim['sub'].startswith(('mailto:', 'https://')), claim
        raw = b64d(signature)
        public = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), b64d(parts['k']))
        public.verify(encode_dss_signature(int.from_bytes(raw[:32], 'big'), int.from_bytes(raw[32:], 'big')),
                      f'{header}.{claims}'.encode(), ec.ECDSA(hashes.SHA256()))
