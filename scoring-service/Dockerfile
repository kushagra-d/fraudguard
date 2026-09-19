FROM python:3.11-slim
WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py ./
COPY models/ ./models/

EXPOSE 8000
ENV PORT=8000
# /docs is FastAPI's auto-served Swagger UI - using it as the healthcheck target
# means no new endpoint has to be added to main.py just to support this.
# Shell form (no brackets) so $PORT actually expands - Render assigns its own
# PORT and routes public traffic only to that port, overriding the 8000
# default used by local Docker Compose.
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=5 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:$PORT/docs')" || exit 1

# Must bind 0.0.0.0, not uvicorn's default 127.0.0.1, or other containers
# (worker) can't reach this one over the Docker network.
CMD uvicorn main:app --host 0.0.0.0 --port $PORT
