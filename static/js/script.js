const chatContainer = document.getElementById("chatContainer");
const messageInput = document.getElementById("messageInput");
const sendButton = document.getElementById("sendButton");
const browseButton = document.getElementById("browseButton");
const fileInput = document.getElementById("fileInput");
const ocrTextContainer = document.querySelector(".ocr-text-container");
const cameraButton = document.getElementById("cameraButton");
const ocrDialogButton = document.getElementById("ocrDialogButton");
let isStreaming = false;
let ocrRunning = false;

const ocrTextHTML = `
<div class="text-container">
  <div class="ocr-text-nav">

    <div class="ocr-loader"></div>

    <button class="ocr-text-btns edit-ocr-btn">
      <svg class="save-ocr-svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
      </svg>
      <svg class="edit-ocr-svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display: none;">
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
        <polyline points="17 21 17 13 7 13 7 21" />
        <polyline points="7 3 7 8 15 8" />
      </svg>
    </button>

    <button class="ocr-text-btns remove-ocr-btn">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M18 6L6 18" />
        <path d="M6 6l12 12" />
      </svg>
    </button>

  </div>
  <textarea readonly></textarea>
</div>
`;

window.addEventListener("load", () => {
  geminiApiKey = localStorage.getItem("geminiApiKey");

  if (geminiApiKey) {
    fetch("/setGeminiApiKey", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ geminiApiKey: geminiApiKey }),
    }).catch((error) => console.error("Error:", error));

    console.log("Gemini API key set");
  }
});

// Display messages in the chat container
function addMessage(content, isUser = false, stream = false) {
  const messageDiv = document.createElement("div");
  messageDiv.className = `message ${isUser ? "user" : "bot"}`;

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = isUser ? "👤" : "🤖";

  const messageContent = document.createElement("div");
  messageContent.className = "message-content";
  messageContent.textContent = content;

  messageDiv.appendChild(avatar);
  messageDiv.appendChild(messageContent);

  chatContainer.appendChild(messageDiv);
  chatContainer.scrollTop = chatContainer.scrollHeight;

  if (stream) {
    return messageContent;
  }
}

function streamResponses(userMessage) {
  isStreaming = true;
  const eventSource = new EventSource(
    `/stream_response?message=${encodeURIComponent(userMessage)}`
  );
  const messageContent = addMessage("", false, true);

  // Handle model start event
  function streamStart() {
    document.getElementById("sendButton").style.display = "none";
    document.getElementById("interruptButton").style.display = "flex";
  }
  // Handle model end event
  function streamEnd() {
    document.getElementById("sendButton").style.display = "flex";
    document.getElementById("interruptButton").style.display = "none";
    isStreaming = false;
    eventSource.close();
  }

  // Event listeners for stream start and end
  eventSource.addEventListener("stream_start", streamStart);
  eventSource.addEventListener("stream_end", streamEnd);

  eventSource.onmessage = function (event) {
    messageContent.textContent += event.data;
    chatContainer.scrollTop = chatContainer.scrollHeight;
  };

  eventSource.onerror = function (event) {
    console.error("EventSource failed:", event);
    eventSource.close();
  };

  // Handle stream interruption
  interruptButton = document.getElementById("interruptButton");
  interruptButton.addEventListener("click", function () {
    streamEnd();

    fetch("/interrupt", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: "Interrupt" }),
    })
      .then((response) => response.json())
      .then((data) => console.log(data))
      .catch((error) => console.error("Error:", error));
  });
}

function handleSend() {
  const message = messageInput.value.trim();

  let ocrTextareaTexts = ocrDialog.querySelectorAll(".text-container textarea");
  let ocrTexts = "";
  if (ocrTextareaTexts) {
    ocrTextareaTexts.forEach((textarea) => {
      let ocrText = textarea.value.trim();
      ocrTexts += ocrText + "\n";
    });
  }

  promptmessage = ocrTexts + "\n" + message;
  promptmessage = promptmessage.trim();

  if (promptmessage) {
    addMessage(promptmessage, true);
    messageInput.value = "";

    streamResponses(promptmessage);
  }
}

// Send message when send button is clicked or enter key is pressed
sendButton.addEventListener("click", handleSend);

messageInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    if (isStreaming) {
      return;
    }
    handleSend();
  }
});

// Camera Dialog Logic
const cameraDialog = document.getElementById("cameraDialog");
const video = document.getElementById("cameraFeed");
let currentStream = null;
let cachedDevices = []; // Cache devices list

// Request initial camera permissions
async function requestCameraPermission() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach((track) => track.stop()); // Stop initial stream
    return true;
  } catch (err) {
    console.error("Camera permission denied:", err);
    return false;
  }
}

async function loadCameras() {
  const select = document.getElementById("cameraSelect");

  try {
    // Only request permissions if we haven't cached devices
    if (!cachedDevices.length) {
      await requestCameraPermission();
      const devices = await navigator.mediaDevices.enumerateDevices();
      cachedDevices = devices.filter((device) => device.kind === "videoinput");
    }

    select.innerHTML = cachedDevices
      .map(
        (device) =>
          `<option value="${device.deviceId}">${
            device.label || `Camera ${cachedDevices.indexOf(device) + 1}`
          }</option>`
      )
      .join("");

    // Load the selected camera from localStorage if available
    const savedCamera = localStorage.getItem("selectedCamera");
    if (savedCamera) {
      select.value = savedCamera;
      await startCamera(savedCamera);
    } else if (cachedDevices.length) {
      // Start with first camera if no saved camera
      await startCamera(cachedDevices[0].deviceId);
    }
  } catch (err) {
    console.error("Error loading cameras:", err);
    select.innerHTML = '<option value="">No cameras available</option>';
  }
}

// Function to start the camera with the given deviceId
async function startCamera(deviceId) {
  try {
    if (currentStream) {
      currentStream.getTracks().forEach((track) => track.stop());
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: deviceId ? { exact: deviceId } : undefined },
    });
    video.srcObject = stream;
    currentStream = stream;
  } catch (err) {
    console.error("Error starting camera:", err);
  }
}

// Open the dialog when the camera button is clicked
cameraButton.addEventListener("click", async () => {
  cameraDialog.showModal();
  await loadCameras(); // Wait for cameras to load
});
// Close camera when dialog closes
function closeCamera() {
  if (currentStream) {
    currentStream.getTracks().forEach((track) => track.stop());
  }
  cameraDialog.close();
}
// Event listener for camera select change
document.getElementById("cameraSelect").addEventListener("change", (e) => {
  const selectedCamera = e.target.value;
  localStorage.setItem("selectedCamera", selectedCamera); // Save selected camera in local storage
  startCamera(e.target.value);
});

// Close the dialog when the close button is clicked
document
  .getElementById("closeCameraDialogBtn")
  .addEventListener("click", () => {
    closeCamera();
    cameraDialog.close();
  });

// Capture image from video feed
const captureBtn = document.getElementById("captureBtn");
const capturedDialog = document.getElementById("capturedDialog");
const capturedImage = document.getElementById("capturedImage");
let cropper = null;

captureBtn.addEventListener("click", () => {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  context.drawImage(video, 0, 0, canvas.width, canvas.height);

  const imageData = canvas.toDataURL("image/png");

  closeCamera();
  capturedDialog.showModal();

  // Display the captured image
  capturedImage.src = imageData;

  // Destroy existing cropper if it exists
  if (cropper) {
    cropper.destroy();
    cropper = null;
  }

  // Initialize new cropper
  cropper = new Cropper(capturedImage, {
    viewMode: 1, // Optional: restrict the crop box to not exceed the size of the image
    autoCropArea: 1,
  });
});

// Confirm cropped image
document.getElementById("confirmBtn").addEventListener("click", function () {
  if (cropper) {
    const croppedCanvas = cropper.getCroppedCanvas();
    if (croppedCanvas) {
      capturedDialog.close();
      const croppedImage = croppedCanvas.toDataURL("image/png");
      cropper.destroy();
      cropper = null;

      ocrRunning = true; // Set ocr running value as true

      // Placeholder ocr text in ocr dialog
      ocrTextContainer.insertAdjacentHTML("beforeend", ocrTextHTML);

      // Get the newest placeholder container
      const placeholders = ocrTextContainer.querySelectorAll(".text-container");
      const lastPlaceholder = placeholders[placeholders.length - 1];

      // Unhide the loader
      const loader = lastPlaceholder.querySelector(".ocr-loader");
      if (loader) loader.style.visibility = "visible";

      // Add loading animation in ocrDialogButton when ocr is being done
      ocrDialogButton.classList.add("opacity-loader");

      // Send the image to the server
      fetch("/capturedImageOcr", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ image: croppedImage }),
      })
        .then((response) => response.json())
        .then((data) => {
          const result = data.result;

          // Hide the loader
          const loader = lastPlaceholder.querySelector(".ocr-loader");
          if (loader) loader.style.visibility = "hidden";

          // Update the textarea with the OCR result
          const textArea = lastPlaceholder.querySelector("textarea");
          if (textArea) {
            textArea.value = result;
          }
          // Adjust size of textarea
          textAreaAdjust(textArea);

          // Scroll to the bottom of ocr text container after result
          const element = document.querySelector(".ocr-text-container");
          element.scrollTop = element.scrollHeight;

          ocrRunning = false; // Set ocr running value as false

          // Remove loading animation in ocrDialogButton when ocr is being done
          ocrDialogButton.classList.remove("opacity-loader");
        })

        .catch((error) => {
          console.error("Error capturing image:", error);
        });
    }
  }
});

// Retry capturing image
document.getElementById("retryBtn").addEventListener("click", async () => {
  capturedDialog.close();
  cameraDialog.showModal();
  await loadCameras();
});

// Close captured dialog when the close button is clicked
document.getElementById("cancelBtn").addEventListener("click", () => {
  if (cropper) {
    cropper.destroy();
    cropper = null;
  }
  capturedDialog.close();
});

// OCR dialog dynamic resizing function
function textAreaAdjust(element) {
  element.style.height = "1px";
  element.style.height = element.scrollHeight + "px";
}

// Open OCR dialog
ocrDialog = document.getElementById("ocrDialog");
ocrDialogButton.addEventListener("click", () => {
  ocrDialog.showModal();

  // Scroll to the bottom of ocr text container
  setTimeout(() => {
    const element = document.querySelector(".ocr-text-container");
    element.scrollTop = element.scrollHeight;
  }, 10);

  // Add event listener to adjust height of textarea in ocr dialog according to text inside
  const ocrTextareas = ocrDialog.querySelectorAll(".text-container textarea");
  ocrTextareas.forEach((textarea) => {
    textAreaAdjust(textarea);
  });

  // Add input event listener to adjust height of textarea in ocr dialog as user types
  const textareas = ocrDialog.querySelectorAll(".text-container textarea");
  textareas.forEach((textarea) => {
    textarea.addEventListener("input", () => {
      textAreaAdjust(textarea);
    });
  });
});

// Close OCR dialog
document.getElementById("closeOcrDialogBtn").addEventListener("click", () => {
  ocrDialog.close();
});

// Add event listener to ocr texts for edit button
ocrDialog.addEventListener("click", (event) => {
  const button = event.target.closest(".edit-ocr-btn");
  if (!button) return;

  const container = button.closest(".text-container");
  if (!container) return;
  const textarea = container.querySelector("textarea");
  const saveocrsvg = container.querySelector(".save-ocr-svg");
  const editocrsvg = container.querySelector(".edit-ocr-svg");
  if (!saveocrsvg || !editocrsvg) return;

  // Toggle readonly state
  if (textarea.hasAttribute("readonly")) {
    textarea.removeAttribute("readonly");
    editocrsvg.style.display = "block";
    saveocrsvg.style.display = "none";
  } else {
    textarea.setAttribute("readonly", "");
    editocrsvg.style.display = "none";
    saveocrsvg.style.display = "block";
  }
  textarea.focus();
});

// Add event listener to remove button for ocr texts
ocrDialog.addEventListener("click", (event) => {
  const button = event.target.closest(".remove-ocr-btn");
  if (!button) return;

  const container = button.closest(".text-container");
  if (!container) return;

  if (!ocrRunning) {
    container.remove();
  }
});

// Browse images for OCR
document.getElementById("browseButton").addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (file) {
    ocrRunning = true; // Set ocr running value as true

    // Placeholder ocr text in ocr dialog
    ocrTextContainer.insertAdjacentHTML("beforeend", ocrTextHTML);

    // Get the newest placeholder container
    const placeholders = ocrTextContainer.querySelectorAll(".text-container");
    const lastPlaceholder = placeholders[placeholders.length - 1];

    // Unhide the loader
    const loader = lastPlaceholder.querySelector(".ocr-loader");
    if (loader) loader.style.visibility = "visible";

    // Add loading animation in ocrDialogButton when ocr is being done
    ocrDialogButton.classList.add("opacity-loader");

    const reader = new FileReader();

    reader.onload = function () {
      base64String = reader.result;

      // Send the selected image to the server
      fetch("/capturedImageOcr", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ image: base64String }),
      })
        .then((response) => response.json())
        .then((data) => {
          const result = data.result;

          // Hide the loader
          const loader = lastPlaceholder.querySelector(".ocr-loader");
          if (loader) loader.style.visibility = "hidden";

          // Update the textarea with the OCR result
          const textArea = lastPlaceholder.querySelector("textarea");
          if (textArea) {
            textArea.value = result;
          }
          // Adjust size of textarea
          textAreaAdjust(textArea);

          // Scroll to the bottom of ocr text container after result
          const element = document.querySelector(".ocr-text-container");
          element.scrollTop = element.scrollHeight;

          ocrRunning = false; // Set ocr running value as false

          // Remove loading animation in ocrDialogButton when ocr is being done
          ocrDialogButton.classList.remove("opacity-loader");
        })
        .catch((error) => console.error("Error:", error));
    };
    reader.readAsDataURL(file);
  }
});

// Prompt to input gemini api key
document.getElementById("apiPromptBtn").addEventListener("click", () => {
  let geminiApiKey = prompt("Enter your Gemini API Key");

  if (geminiApiKey) {
    localStorage.setItem("geminiApiKey", geminiApiKey);
    console.log("Gemini API key set");

    fetch("/setGeminiApiKey", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ geminiApiKey: geminiApiKey }),
    }).catch((error) => console.error("Error:", error));
  }
});
