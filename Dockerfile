# OpenVera Docker image
#
# The frontend must be pre-built before building the Docker image:
#   cd frontend && npm install && npm run build
#
# This is required because @swedev/ui is a local file dependency
# that isn't available inside the Docker build context.

FROM python:3.13-slim
WORKDIR /openvera/app

COPY requirements.txt /openvera/
RUN pip install --no-cache-dir -r /openvera/requirements.txt

COPY app/ /openvera/app/
COPY scripts/ /openvera/scripts/
COPY frontend/dist /openvera/frontend/dist

EXPOSE 8888

CMD ["python", "run_server.py"]
