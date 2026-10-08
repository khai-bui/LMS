from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "Internal LMS"
    DATABASE_URL: str = "mysql+pymysql://root@localhost:3306/lms_db"
    # DATABASE_URL: str = "postgresql://lms_db_w6sd_user:kPbTgPVjBEL8PveOKZE8MZRvoxqf9bW2@dpg-d3t388s9c44c73cgspq0-a/lms_db_w6sd"
    JWT_SECRET_KEY: str = "8b2d90a176b8b7b8c2af5d969b7c2d5b889ed2c1742b2a63d1577cbf72e53a91"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    class Config:
        env_file = ".env"

settings = Settings()
