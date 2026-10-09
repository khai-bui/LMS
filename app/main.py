from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse

from app.api import (
    routes_auth,
    routes_notification,
    routes_student,
    routes_customer_support,
    routes_manager,
    routes_lecturer,
    routes_teacher_coordinator,
    routes_files,
)

from app.db import database
from app.core.config import settings


# =========================
# DATABASE
# =========================
# database.Base.metadata.create_all(bind=database.engine)


# =========================
# FASTAPI
# =========================
app = FastAPI(title=settings.PROJECT_NAME)


# =========================
# CORS
# =========================
origins = [
    "http://127.0.0.1:5500",
    "http://localhost:5500",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================
# STATIC FILES
# =========================
app.mount(
    "/static",
    StaticFiles(directory="app/static"),
    name="static",
)


# =========================
# HTML TEMPLATES
# =========================

templates = Jinja2Templates(directory="app/templates")


# =========================
# FRONTEND ROUTES
# =========================

@app.get("/", response_class=HTMLResponse)
async def login_page(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="login.html",
        context={}
    )


@app.get("/login", response_class=HTMLResponse)
async def login_page_alt(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="login.html",
        context={}
    )


@app.get("/student.html", response_class=HTMLResponse)
async def student_dashboard(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="student.html",
        context={}
    )


@app.get("/student-dashboard", response_class=HTMLResponse)
async def student_dashboard_alias(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="student.html",
        context={}
    )


@app.get("/manager.html", response_class=HTMLResponse)
async def manager_dashboard(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="manager_dashboard.html",
        context={}
    )


@app.get("/manager-dashboard", response_class=HTMLResponse)
async def manager_dashboard_alias(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="manager_dashboard.html",
        context={}
    )


@app.get("/lecturer.html", response_class=HTMLResponse)
async def lecturer_dashboard(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="lec_dashboard.html",
        context={}
    )


@app.get("/lecturer-dashboard", response_class=HTMLResponse)
async def lecturer_dashboard_alias(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="lec_dashboard.html",
        context={}
    )


@app.get("/cs.html", response_class=HTMLResponse)
async def cs_dashboard(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="cs_dashboard.html",
        context={}
    )


@app.get("/cs-dashboard", response_class=HTMLResponse)
async def cs_dashboard_alias(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="cs_dashboard.html",
        context={}
    )


@app.get("/tc.html", response_class=HTMLResponse)
async def tc_dashboard(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="tc_dashboard.html",
        context={}
    )


@app.get("/tc-dashboard", response_class=HTMLResponse)
async def tc_dashboard_alias(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="tc_dashboard.html",
        context={}
    )


# =========================
# API ROUTERS
# =========================
app.include_router(
    routes_auth.router,
    prefix="/auth",
    tags=["Auth"],
)

app.include_router(
    routes_notification.router,
    prefix="/notify",
    tags=["Notification"],
)

app.include_router(
    routes_student.router,
    prefix="/student",
    tags=["Student"],
)

app.include_router(
    routes_manager.router,
    prefix="/manager",
    tags=["Manager"],
)

app.include_router(
    routes_lecturer.router,
    prefix="/lec",
    tags=["Lecturer"],
)

app.include_router(
    routes_customer_support.router,
    prefix="/cs",
    tags=["Customer Support"],
)

app.include_router(
    routes_teacher_coordinator.router,
    prefix="/tc",
    tags=["Teacher Coordinator"],
)

app.include_router(
    routes_files.router,
    prefix="/tc",
    tags=["Files"],
)