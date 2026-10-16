"""A minimal OpenID Connect provider for tests: publishes discovery and JWKS and signs ID tokens.

The API trusts it only outside production, through GOOGLE_OIDC_AUTHORITY / APPLE_OIDC_AUTHORITY.
"""
import base64
import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding, rsa


# A 1x1 PNG, served as the account's Google profile picture.
PICTURE = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==')


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode()


def int_bytes(value: int) -> bytes:
    return value.to_bytes((value.bit_length() + 7) // 8, 'big')


class FakeIdentityProvider:
    def __init__(self, port: int):
        self.port = port
        self.key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        self.other_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        numbers = self.key.public_key().public_numbers()
        self.picture_requests = 0
        self.jwks = {'keys': [{'kty': 'RSA', 'use': 'sig', 'alg': 'RS256', 'kid': 'test-key',
                               'n': b64url(int_bytes(numbers.n)), 'e': b64url(int_bytes(numbers.e))}]}
        provider = self

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                parts = self.path.strip('/').split('/')
                name = parts[0] if parts else ''
                if self.path.endswith('/.well-known/openid-configuration'):
                    body = {'issuer': provider.issuer(name), 'jwks_uri': provider.issuer(name) + '/jwks',
                            'authorization_endpoint': provider.issuer(name) + '/auth', 'id_token_signing_alg_values_supported': ['RS256'],
                            'response_types_supported': ['id_token'], 'subject_types_supported': ['public']}
                elif self.path.endswith('/jwks'):
                    body = provider.jwks
                elif self.path.endswith('/picture.png'):
                    provider.picture_requests += 1
                    self.send_response(200)
                    self.send_header('Content-Type', 'image/png')
                    self.send_header('Content-Length', str(len(PICTURE)))
                    self.end_headers()
                    self.wfile.write(PICTURE)
                    return
                elif self.path.endswith('/moved'):
                    # The API must not follow this to the real picture.
                    self.send_response(302)
                    self.send_header('Location', provider.issuer(name) + '/picture.png')
                    self.end_headers()
                    return
                elif self.path.endswith('/page.html'):
                    data = b'<html>not a picture</html>'
                    self.send_response(200)
                    self.send_header('Content-Type', 'image/png')
                    self.send_header('Content-Length', str(len(data)))
                    self.end_headers()
                    self.wfile.write(data)
                    return
                else:
                    self.send_response(404); self.end_headers(); return
                data = json.dumps(body).encode()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def log_message(self, *args):
                pass

        self.server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def issuer(self, name: str) -> str:
        return f'http://localhost:{self.port}/{name}'

    def token(self, provider: str, audience: str, subject: str, email=None, email_verified=True, name=None,
              issuer=None, expires_in=600, wrong_key=False, picture=None) -> str:
        now = int(time.time())
        claims = {'iss': issuer or self.issuer(provider), 'aud': audience, 'sub': subject, 'iat': now, 'exp': now + expires_in}
        if email is not None:
            claims['email'] = email
            # Apple sends the flag as a string, Google as a boolean.
            claims['email_verified'] = ('true' if email_verified else 'false') if provider == 'apple' else email_verified
        if name:
            claims['name'] = name
        if picture:
            claims['picture'] = picture
        header = {'alg': 'RS256', 'typ': 'JWT', 'kid': 'test-key'}
        signing_input = b64url(json.dumps(header).encode()) + '.' + b64url(json.dumps(claims).encode())
        key = self.other_key if wrong_key else self.key
        signature = key.sign(signing_input.encode(), padding.PKCS1v15(), hashes.SHA256())
        return signing_input + '.' + b64url(signature)
