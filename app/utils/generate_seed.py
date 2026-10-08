import hashlib
from passlib.context import CryptContext
from datetime import datetime

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str) -> str:
    # hash SHA-256
    sha256_pw = hashlib.sha256(password.encode("utf-8")).hexdigest()
    return pwd_context.hash(sha256_pw)

plain_password = "123456"
hashed_pw = hash_password(plain_password)
now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

print("🔐 Generated bcrypt hash:", hashed_pw)
print("\n-- Copy from below into your MySQL seed file:\n")

# 🔹 Danh sách users theo role
roles = [
    ("manager", [
        ("Manager One", "manager1@lms.com"),
        ("Manager Two", "manager2@lms.com")
    ]),
    ("tc", [
        ("TC One", "tc1@lms.com"),
        ("TC Two", "tc2@lms.com")
    ]),
    ("cs", [
        ("CS One", "cs1@lms.com"),
        ("CS Two", "cs2@lms.com")
    ]),
    ("lec", [
        ("Lecturer One", "lec1@lms.com"),
        ("Lecturer Two", "lec2@lms.com")
    ]),
    ("student", [
        ("Student One", "student1@lms.com"),
        ("Student Two", "student2@lms.com")
    ]),
]

role_id = {
    "manager": 1,
    "tc": 2,
    "cs": 3,
    "lec": 4,
    "student": 5
}

for role_name, users in roles:
    print(f"-- {role_name.upper()} (role_id = {role_id[role_name]})")
    for name, email in users:
        sql = f"""INSERT INTO USERS (name, email, password_hash, role_id, status, created_at)
VALUES ('{name}', '{email}', '{hashed_pw}', {role_id[role_name]}, 'active', '{now}');"""
        print(sql)
    print()
