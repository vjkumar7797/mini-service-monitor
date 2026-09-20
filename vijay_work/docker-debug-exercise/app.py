from flask import Flask, jsonify, send_from_directory

app = Flask(__name__)


@app.route("/")
def index():
    # BUG 5: Application error visible in logs - undefined variable
    return send_from_directory(".", "index.html")

@app.route("/health", methods=["GET"])
def healthcheck():
    return jsonify({"status": "healthy"})


if __name__ == "__main__":
    # BUG 6: Binds to 127.0.0.1 so website cannot be accessed from outside container
    # BUG 7: Port 5000 does not match Dockerfile EXPOSE 8080
    app.run(host="0.0.0.0", debug=True, port=5000)
