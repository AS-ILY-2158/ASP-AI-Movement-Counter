
const camera = document.getElementById("camera");

const startBtn = document.getElementById("start-btn");
const stopBtn = document.getElementById("stop-btn");

const statusText = document.getElementById("status");

const totalCount = document.getElementById("total-count");
const incompleteCount = document.getElementById("incomplete-count");
const durationDisplay = document.getElementById("duration");

const cameraPlaceholder = document.getElementById("camera-placeholder");

let selectedExercise = "jumping-jacks";
let cameraStream = null;

let startTime = null;
let timerInterval = null;

let totalReps = 0;
let incompleteReps = 0;


// Exercise Selection

document.querySelectorAll(".exercise-btn").forEach(button => {

    button.addEventListener("click", () => {

        if (startBtn.disabled) return;

        document.querySelectorAll(".exercise-btn").forEach(btn => {
            btn.classList.remove("active");
        });

        button.classList.add("active");

        selectedExercise = button.dataset.exercise;

    });

});


// Camera Access

async function startCamera() {

    if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera access is not supported. Use HTTPS.");
    }

    try {

        cameraStream = await navigator.mediaDevices.getUserMedia({

            video: {
                facingMode: "user",
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },

            audio: false

        });

        camera.srcObject = cameraStream;

        await camera.play();

        camera.style.display = "block";
        cameraPlaceholder.style.display = "none";

    } catch (error) {

        throw error;

    }

}


// Timer

function updateTimer() {

    if (!startTime) return;

    const elapsed = Math.floor((Date.now() - startTime) / 1000);

    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;

    durationDisplay.textContent =
        String(minutes).padStart(2, "0") + ":" +
        String(seconds).padStart(2, "0");

}


// Start Workout

startBtn.addEventListener("click", async () => {

    startBtn.disabled = true;
    statusText.textContent = "Starting camera...";

    try {

        await startCamera();

        totalReps = 0;
        incompleteReps = 0;

        totalCount.textContent = "0";
        incompleteCount.textContent = "0";
        durationDisplay.textContent = "00:00";

        startTime = Date.now();

        timerInterval = setInterval(updateTimer, 500);

        stopBtn.disabled = false;

        statusText.textContent = "Camera Active - AI Engine Pending";

    } catch (error) {

        statusText.textContent = "Camera Error: " + error.message;

        stopCamera();

        startBtn.disabled = false;

    }

});


// Stop Workout

stopBtn.addEventListener("click", () => {

    updateTimer();

    clearInterval(timerInterval);

    timerInterval = null;
    startTime = null;

    stopCamera();

    startBtn.disabled = false;
    stopBtn.disabled = true;

    statusText.textContent = "Workout Stopped";

});


// Stop Camera

function stopCamera() {

    if (cameraStream) {

        cameraStream.getTracks().forEach(track => track.stop());

        cameraStream = null;

    }

    camera.srcObject = null;

    camera.style.display = "none";
    cameraPlaceholder.style.display = "flex";

}
