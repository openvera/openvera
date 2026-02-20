# OpenVera Docker image
#
# The frontend must be pre-built before building the Docker image:
#   cd frontend && npm install && npm run build
#
# This is required because @swedev/ui is a local file dependency
# that isn't available inside the Docker build context.

FROM python:3.13-slim
WORKDIR /vera/app

COPY requirements.txt /vera/
RUN pip install --no-cache-dir -r /vera/requirements.txt

COPY app/ /vera/app/
COPY scripts/ /vera/scripts/
COPY frontend/dist /vera/frontend/dist

EXPOSE 8888

CMD ["python", "run_server.py"]
