import os

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

MYSQLHOST = os.getenv("MYSQLHOST", "127.0.0.1")
MYSQLPORT = os.getenv("MYSQLPORT", "3306")
MYSQLUSER = os.getenv("MYSQLUSER", "root")
MYSQLPASSWORD = os.getenv("MYSQLPASSWORD", "")
MYSQLDATABASE = os.getenv("MYSQLDATABASE", "lms_db")

DATABASE_URL = (
    f"mysql+pymysql://{MYSQLUSER}:{MYSQLPASSWORD}"
    f"@{MYSQLHOST}:{MYSQLPORT}/{MYSQLDATABASE}"
)

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

Base = declarative_base()

def get_db():
    db = SessionLocal()

    try:
        yield db
    finally:
        db.close()