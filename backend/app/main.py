from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from contextlib import asynccontextmanager
from app.services.pipeline import start_pipeline, scheduler
from app.api.routes import router as api_router
from fastapi_cache import FastAPICache
from fastapi_cache.backends.inmemory import InMemoryBackend

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Start the background news aggregator pipeline
    start_pipeline()
    FastAPICache.init(InMemoryBackend())
    yield
    # Shutdown: Stop the pipeline gracefully
    scheduler.shutdown()

app = FastAPI(
    title="AI Real-Time News API",
    description="FastAPI backend for delivering real-time, AI-summarized trending news.",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS for the Next.js frontend on the common local dev hostnames.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "https://up-2-date-phi.vercel.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(GZipMiddleware, minimum_size=1000)

app.include_router(api_router, prefix="/api", tags=["News"])

@app.get("/")
def read_root():
    return {"status": "ok", "message": "News API is running"}
