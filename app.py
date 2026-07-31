import os
import re
import json
import time
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv
from groq import Groq
from cars_data import cars

load_dotenv()

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)

# Helper for local rule-based fallback responses
def get_local_fallback_response(message):
    msg = message.lower()
    
    # 1. Comparison Intent
    if "compare" in msg or " vs " in msg:
        found_cars = [c for c in cars if c['name'].lower() in msg or c['brand'].lower() in msg]
        if len(found_cars) >= 2:
            return {
                "reply": f"### Car Comparison\nI found the **{found_cars[0]['brand']} {found_cars[0]['name']}** and **{found_cars[1]['brand']} {found_cars[1]['name']}** in your request. I've compiled a detailed comparison table for you below.",
                "widget": {
                    "type": "comparison",
                    "data": {
                        "car1": found_cars[0]['id'],
                        "car2": found_cars[1]['id']
                    }
                }
            }

    # 2. Loan Calculator Intent
    if any(k in msg for k in ["loan", "emi", "calculate", "finance"]):
        matched_car = next((c for c in cars if c['name'].lower() in msg or c['brand'].lower() in msg), None)
        target_car = matched_car if matched_car else cars[0]
        # Ensure target_car has numericPrice
        price = target_car.get('numericPrice') or 6800000
        return {
            "reply": f"### Auto Loan Calculator\nHere is the interactive auto loan estimator pre-filled for the **{target_car['brand']} {target_car['name']}** ({target_car['price']}). You can adjust the down payment, interest rate, and tenure directly.",
            "widget": {
                "type": "loan",
                "data": {
                    "carId": target_car['id'],
                    "name": f"{target_car['brand']} {target_car['name']}",
                    "price": price
                }
            }
        }

    # 3. Recommendation Intent
    if any(k in msg for k in ["recommend", "suggest", "best", "buy"]):
        filtered_list = cars
        if "electric" in msg or "ev" in msg:
            filtered_list = [c for c in filtered_list if c['type'] == "Electric"]
        elif "suv" in msg:
            filtered_list = [c for c in filtered_list if c['type'] == "SUV"]
        elif any(k in msg for k in ["sports", "performance", "fast"]):
            filtered_list = [c for c in filtered_list if c['type'] == "Sports"]
        elif "sedan" in msg:
            filtered_list = [c for c in filtered_list if c['type'] == "Sedan"]
        elif "truck" in msg or "pickup" in msg:
            filtered_list = [c for c in filtered_list if c['type'] == "Truck"]
        elif "luxury" in msg:
            filtered_list = [c for c in filtered_list if c['type'] in ["Luxury", "Electric"]]

        # Check budget filters (INR)
        if any(k in msg for k in ["under", "below", "less than"]):
            match = re.search(r"(?:under|below|than)\s*(?:₹|rs\.?)?\s*(\d+)\s*(lakh|l|crore|cr)?", msg, re.IGNORECASE)
            if match:
                value = int(match.group(1))
                multiplier = 100000  # default to lakhs
                unit = match.group(2)
                if unit:
                    unit = unit.lower()
                    if unit.startswith("cr"):
                        multiplier = 10000000
                    elif unit.startswith("l"):
                        multiplier = 100000
                budget_limit = value * multiplier
                # Fallback to get numericPrice
                filtered_list = [c for c in filtered_list if (c.get('numericPrice') or 0) <= budget_limit]

        if filtered_list:
            car_ids = [c['id'] for c in filtered_list[:3]]
            list_names = ", ".join([f"**{c['brand']} {c['name']}** ({c['price']})" for c in filtered_list[:3]])
            return {
                "reply": f"### Recommendations\nBased on your criteria, I highly recommend checking out: {list_names}. I have loaded their detail preview cards below.",
                "widget": {
                    "type": "recommendation",
                    "data": {
                        "carIds": car_ids
                    }
                }
            }

    # 4. Default General Conversational Car Fallback
    return {
        "reply": """### Welcome to DriveAI!
I am your premium automotive assistant. You can ask me to:
- **Recommend cars**: *"Show me electric SUVs under 70 Lakhs"* or *"Suggest a fast sports car"*
- **Compare models**: *"Compare Mustang GT vs 911 Carrera"* or *"Compare Ioniq 5 vs Model Y"*
- **Estimate Loan Payments**: *"Calculate loan for Audi A6"* or *"Calculate EMI"*
- **General specs**: *"What is the horsepower of the Rivian R1T?"* or *"Tell me about Toyota Camry"*

How can I help you kickstart your automotive journey today?""",
        "widget": None
    }

# Route: Serve Main Index
@app.route('/')
def serve_index():
    return send_from_directory('.', 'index.html')

# Route: Serve other static files
@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('.', path)

# API: Get all cars
@app.route('/api/cars', methods=['GET'])
def get_cars():
    return jsonify(cars)

# API: Compare two cars
@app.route('/api/compare', methods=['GET'])
def compare_cars():
    car1_id = request.args.get('car1')
    car2_id = request.args.get('car2')
    
    c1 = next((c for c in cars if c['id'] == car1_id), None)
    c2 = next((c for c in cars if c['id'] == car2_id), None)
    
    if not c1 or not c2:
        return jsonify({"error": "One or both cars not found."}), 404
        
    return jsonify({"car1": c1, "car2": c2})

# API: Process Chat
@app.route('/api/chat', methods=['POST'])
def chat():
    data = request.json or {}
    message = data.get('message')
    chat_history = data.get('chatHistory') or []

    if not message:
        return jsonify({"error": "Message is required."}), 400

    api_key = os.getenv("GROQ_API_KEY")
    if not api_key or api_key.strip() == "" or api_key == "your_groq_api_key_here":
        print("Groq API key not set in Flask. Using local fallback.")
        fallback = get_local_fallback_response(message)
        time.sleep(0.8)  # simulate typing lag
        return jsonify(fallback)

    try:
        client = Groq(api_key=api_key)

        system_prompt = f"""You are "DriveAI" — a premium, high-end automotive AI consultant. You help users research, choose, compare, and calculate finances for cars.
You have access to the following real database of 15 cars:
{json.dumps(cars, indent=2)}

Instructions for responses:
1. Always respond in valid JSON format. Your response structure must be EXACTLY:
{{
  "reply": "Your markdown-formatted textual explanation, detailed specification, advice, pros/cons, or feedback.",
  "widget": null OR {{
    "type": "recommendation" | "comparison" | "loan",
    "data": {{
      // If type is "recommendation", specify:
      "carIds": ["id1", "id2", ...] // array of matching car 'id' fields from the database (max 3)
      
      // If type is "comparison", specify:
      "car1": "id1", // 'id' of the first car
      "car2": "id2"  // 'id' of the second car
      
      // If type is "loan", specify:
      "carId": "id", // 'id' of the car
      "name": "Brand Name",
      "price": 5000000 // numeric price in INR
    }}
  }}
}}

2. UI Widgets Triggers:
- If the user wants to compare two cars, identify their IDs from the database, set widget "type" to "comparison", and specify the IDs.
- If the user asks for recommendations, filters cars by price, electric/fuel, type, or uses terms like "suggest", filter from the database, list them in the text reply, set widget "type" to "recommendation", and provide the top 1-3 matching carIds.
- If the user asks about loans, EMI, calculations, monthly payments, or finance options for a specific car, set widget "type" to "loan", and provide the carId, name, and numericPrice.

3. Keep your tone elegant, professional, highly informative, and enthusiastic about cars.
4. Output ONLY the raw JSON block. Do not wrap in markdown code blocks. Just output the JSON starting with {{ and ending with }}."""

        messages = [
            {"role": "system", "content": system_prompt}
        ]

        # Append chat history (max 6 steps)
        for h in chat_history[-6:]:
            role = h.get('role')
            content = h.get('content')
            if isinstance(content, dict):
                content = json.dumps(content)
            messages.append({"role": role, "content": content})

        # Append current user message
        messages.append({"role": "user", "content": message})

        completion = client.chat.completions.create(
            messages=messages,
            model="llama-3.3-70b-versatile",
            temperature=0.3,
            max_tokens=1000,
            response_format={"type": "json_object"}
        )

        content = completion.choices[0].message.content
        json_response = json.loads(content)
        return jsonify(json_response)

    except Exception as e:
        print("Groq API Call Error in Flask:", e)
        fallback = get_local_fallback_response(message)
        fallback["reply"] = f"*(System note: Fallback active due to API issue)*\n\n{fallback['reply']}"
        return jsonify(fallback)

if __name__ == '__main__':
    print("====================================================")
    print(" DriveAI Flask Backend running at: http://localhost:5000")
    print(" Serving static site from: " + os.path.abspath("."))
    print("====================================================")
    app.run(host='0.0.0.0', port=5000, debug=True)
