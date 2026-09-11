FROM python:3.11-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends libexpat1 \
    && rm -rf /var/lib/apt/lists/*

COPY services/geonode-runtime/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

ARG INSTALL_TEMPORAL=false
COPY services/geonode-runtime/requirements-temporal.txt /tmp/requirements-temporal.txt
RUN if [ "$INSTALL_TEMPORAL" = "true" ]; then pip install --no-cache-dir -r /tmp/requirements-temporal.txt; fi

COPY services/geonode-runtime /app/services/geonode-runtime
COPY manifests /app/manifests

EXPOSE 8100

CMD ["uvicorn", "app.main:app", "--app-dir", "services/geonode-runtime", "--host", "0.0.0.0", "--port", "8100"]
