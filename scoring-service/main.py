from fastapi import FastAPI

app = FastAPI()

@app.post("/score")
def score(payload: dict):
    return {"score": 0.5, "decision": "allow"}
