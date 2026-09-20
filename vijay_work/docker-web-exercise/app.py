from flask import Flask, jsonify, send_from_directory


app = Flask(__name__)


@app.route("/")
def index():
    return send_from_directory(".", "index.html")


@app.route("/style.css")
def css():
    return send_from_directory(".", "style.css")


@app.route("/api")
def helloworld():
    return jsonify({"msg": "Hello World!"})


@app.route("/health", methods=["GET"])
def healthcheck():
    return jsonify({"status": "healthy"})


if __name__ == "__main__":
    app.run(host="0.0.0.0", debug=True, port=5000)
