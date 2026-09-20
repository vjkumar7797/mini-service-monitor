# Use a lightweight Python 3 image as base
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Copy application files into the container
COPY app.py requirements.txt .

# Copy HTML and CSS files so they're available at runtime
COPY index.html .
COPY style.css .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Expose the web server port
EXPOSE 5000

# Start the web server when container starts
CMD ["python", "app.py"]
