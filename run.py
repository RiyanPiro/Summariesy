import base64
from google import genai
from google.genai import types
import threading
from flask import Flask, render_template, request, Response, jsonify

app = Flask(__name__)

chat = None

# Global flag to indicate interruption
interrupted = threading.Event()

chat_model = "gemini-2.0-flash"
ocr_model = "gemini-2.0-flash"

@app.route('/')
def index():
    return render_template('index.html')

# Endpoint to set gemini api key
@app.route('/setGeminiApiKey', methods=['POST'])
def setGeminiApiKey():
    data = request.get_json()
    gemini_api = data['geminiApiKey']

    # Create client and set system instructions
    global client, chat
    client = genai.Client(api_key=gemini_api)
    system_instruction = "Summarize the given texts by highlighting the key points and explaining them."
    chat = client.chats.create(model=chat_model)
    chat.send_message(system_instruction)

    return jsonify(), 200

# Endpoint to stream responses from model to client
@app.route('/stream_response', methods=['GET'])
def stream_response():
    user_message = request.args.get('message')
    if not user_message:
        return jsonify({'error': 'No message provided'}), 400
    print(f"\nUser: {user_message}\n")

    def generate():
        try:
            yield "event: stream_start\ndata: Initializing stream\n\n" # Event to indicate model start

            # Streaming each chunk and building complete assistant message
            for chunk in chat.send_message_stream(user_message):
                if interrupted.is_set():
                    print('Stream interrupted')
                    interrupted.clear()
                    yield "event: stream_end\ndata: Ending stream\n\n" 
                    break
                else:
                    print(chunk.text, end='', flush=True)
                    yield f"data: {chunk.text}\n\n"

        except Exception as e:
            print(f"Error during streaming: {e}")
            yield f"data: Error occurred: {str(e)}\n\n"

        finally:
            print("\n\n")
            yield "event: stream_end\ndata: Ending stream\n\n"

    if interrupted.is_set():
        interrupted.clear()

    return Response(
        generate(),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        }
    )

# Endpoint to perform ocr on the captured image from client
@app.route('/capturedImageOcr', methods=['POST'])
def capturedimage_ocr():
    try:
        data = request.get_json()
        image_base64 = data['image']

        if not image_base64.startswith(("data:image/png;base64,", "data:image/jpeg;base64,", "data:image/jpg;base64,", "data:image/webp;base64,")):
            return jsonify({"error": "Invalid image format"}), 400

        image_bytes = base64.b64decode(image_base64.split(",")[1])

        response = client.models.generate_content(
            model=ocr_model,
            contents=[
                """Extract the main body text from the provided image. Exclude cover pages, title pages, table of contents, appendices, indexes, headers, footers, bookmarks, annotations, images, tables, footnotes, and any other non-body text elements, include titles and subtitles if exist.
                Format the extracted text by following these guidelines:
                1. Maintain paragraph separations from the original text.
                2. If you've finished extracting all the requested text, end your response without any text.""",
                types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg"),
            ],
        )
        print(response.text + "\n\n")

        return jsonify({"message": "Image processed successfully", "result": response.text}), 200

    except Exception as e:
        print("Error processing image:", e)
        return jsonify({"error": str(e)}), 500

# Endpoint to interrupt the model
@app.route('/interrupt', methods=['POST'])
def interrupt():
    interrupted.set()
    return jsonify({'status': 'interrupted'}), 200

if __name__ == '__main__':
    app.run(debug=True)