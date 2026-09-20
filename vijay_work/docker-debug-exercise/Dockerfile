# BUG 1: Incorrect Dockerfile instruction - COPY source path does not exist (no src/ dir)
# BUG 2: Missing style.css copy
# BUG 3: Incorrect application port - app runs on 5000, not 8080
# BUG 4: Incorrect CMD - file is app.py, not server.py -> container exits immediately
FROM python:3.11-slim

WORKDIR /app

COPY app.py requirements.txt .

COPY index.html . 

COPY style.css .

RUN pip install --no-cache-dir -r requirements.txt

EXPOSE 5000

CMD ["python", "app.py"]
