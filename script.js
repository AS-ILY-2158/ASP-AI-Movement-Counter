
/* ============================================
   ASP AI MOVEMENT COUNTER
   Complete JavaScript Engine
   ============================================ */

import {
    PoseLandmarker,
    FilesetResolver,
    DrawingUtils
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";


/* ============================================
   1. DOM ELEMENTS
   ============================================ */

const video = document.getElementById("camera");
const canvas = document.getElementById("pose-canvas");
const ctx = canvas.getContext("2d");

const cameraSelect = document.getElementById("camera-select");

const cameraPlaceholder = document.getElementById("camera-placeholder");
const cameraError = document.getElementById("camera-error");
const cameraErrorMessage = document.getElementById("camera-error-message");

const systemStatusIndicator = document.getElementById("system-status-indicator");
const systemStatusText = document.getElementById("system-status-text");

const cameraStatus = document.getElementById("camera-status");
const aiStatus = document.getElementById("ai-status");
const bodyStatus = document.getElementById("body-status");

const totalCountElement = document.getElementById("total-count");
const incompleteCountElement = document.getElementById("incomplete-count");
const durationElement = document.getElementById("duration");

const startButton = document.getElementById("start-btn");
const stopButton = document.getElementById("stop-btn");

const statusElement = document.getElementById("status");

const resultsSection = document.getElementById("results-section");
const resultExercise = document.getElementById("result-exercise");
const resultTotal = document.getElementById("result-total");
const resultIncomplete = document.getElementById("result-incomplete");
const resultDuration = document.getElementById("result-duration");

const exerciseButtons = document.querySelectorAll(".exercise-btn");


/* ============================================
   2. APPLICATION STATE
   ============================================ */

const state = {
    selectedExercise: "jumping-jacks",

    isRunning: false,
    isStarting: false,

    cameraStream: null,
    poseLandmarker: null,
    drawingUtils: null,

    animationFrameId: null,
    timerInterval: null,

    startTime: null,
    elapsedSeconds: 0,

    totalCount: 0,
    incompleteCount: 0,

    lastVideoTime: -1,
    lastDetectionTime: 0,

    exercisePhase: "ready",

    jumpRopeBaseline: null,
    jumpRopeAirborne: false,
    jumpRopePeak: null,
    jumpRopeLastCountTime: 0,
    jumpRopeBaselineSamples: [],

    previousPose: null,

    processingErrorShown: false
};


/* ============================================
   3. CONFIGURATION
   ============================================ */

const CONFIG = {

    modelUrl:
        "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",

    wasmUrl:
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm",

    minimumVisibility: 0.55,

    jumpingJacks: {
        openWristMargin: 0.08,
        closedWristMargin: 0.02,
        openLegDistance: 0.42,
        closedLegDistance: 0.28
    },

    jumpRope: {
        jumpThreshold: 0.035,
        landingThreshold: 0.012,
        minimumJumpDuration: 150,
        maximumJumpDuration: 1800,
        debounceTime: 250,
        baselineSamples: 20
    }
};


/* ============================================
   4. GENERAL UI FUNCTIONS
   ============================================ */

function updateStatus(message) {
    statusElement.textContent = message;
}

function updateSystemStatus(message, color) {
    systemStatusText.textContent = message;
    systemStatusIndicator.style.backgroundColor = color;
}

function updateCameraStatus(message) {
    cameraStatus.textContent = message;
}

function updateAIStatus(message) {
    aiStatus.textContent = message;
}

function updateBodyStatus(message) {
    bodyStatus.textContent = message;
}

function showCameraError(message) {
    cameraErrorMessage.textContent = message;
    cameraError.hidden = false;
}

function hideCameraError() {
    cameraError.hidden = true;
    cameraErrorMessage.textContent = "";
}

function updateCounters() {
    totalCountElement.textContent = state.totalCount;
    incompleteCountElement.textContent = state.incompleteCount;
}

function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    return (
        String(minutes).padStart(2, "0") +
        ":" +
        String(remainingSeconds).padStart(2, "0")
    );
}

function updateDuration() {
    durationElement.textContent = formatTime(state.elapsedSeconds);
}


/* ============================================
   5. EXERCISE SELECTION
   ============================================ */

function selectExercise(exercise) {

    if (state.isRunning || state.isStarting) {
        return;
    }

    state.selectedExercise = exercise;

    exerciseButtons.forEach(button => {

        const isActive =
            button.dataset.exercise === exercise;

        button.classList.toggle("active", isActive);

        button.setAttribute(
            "aria-pressed",
            String(isActive)
        );
    });

    resultsSection.hidden = true;

    if (exercise === "jumping-jacks") {
        updateStatus("Jumping Jacks selected. Press START when ready.");
    } else {
        updateStatus("Jump Rope selected. Press START when ready.");
    }
}

exerciseButtons.forEach(button => {

    button.addEventListener("click", () => {

        selectExercise(button.dataset.exercise);

    });

});


/* ============================================
   6. RESET WORKOUT DATA
   ============================================ */

function resetWorkoutData() {

    state.totalCount = 0;
    state.incompleteCount = 0;

    state.elapsedSeconds = 0;
    state.startTime = null;

    state.exercisePhase = "ready";

    state.jumpRopeBaseline = null;
    state.jumpRopeAirborne = false;
    state.jumpRopePeak = null;
    state.jumpRopeLastCountTime = 0;
    state.jumpRopeBaselineSamples = [];

    state.previousPose = null;

    state.lastVideoTime = -1;
    state.lastDetectionTime = 0;

    state.processingErrorShown = false;

    updateCounters();
    updateDuration();
}


/* ============================================
   7. LOAD MEDIAPIPE AI
   ============================================ */

async function initializeAI() {

    if (state.poseLandmarker) {
        return;
    }

    updateAIStatus("Loading AI...");
    updateSystemStatus("Loading AI", "#f1c40f");

    const vision = await FilesetResolver.forVisionTasks(
        CONFIG.wasmUrl
    );

    const options = {
        baseOptions: {
            modelAssetPath: CONFIG.modelUrl,
            delegate: "GPU"
        },

        runningMode: "VIDEO",

        numPoses: 1,

        minPoseDetectionConfidence: 0.55,

        minPosePresenceConfidence: 0.55,

        minTrackingConfidence: 0.55
    };

    try {

        state.poseLandmarker =
            await PoseLandmarker.createFromOptions(
                vision,
                options
            );

    } catch (gpuError) {

        console.warn(
            "GPU initialization failed. Trying CPU.",
            gpuError
        );

        options.baseOptions.delegate = "CPU";

        state.poseLandmarker =
            await PoseLandmarker.createFromOptions(
                vision,
                options
            );
    }

    state.drawingUtils = new DrawingUtils(ctx);

    updateAIStatus("AI Ready");
}


/* ============================================
   8. CAMERA INITIALIZATION
   ============================================ */

async function startCamera() {

    if (!navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia) {

        throw new Error(
            "Camera access is not supported. Open this website using HTTPS in a supported browser."
        );
    }

    const facingMode = cameraSelect.value;

    const constraints = {
        audio: false,

        video: {
            facingMode: {
                ideal: facingMode
            },

            width: {
                ideal: 1280
            },

            height: {
                ideal: 720
            }
        }
    };

    const stream =
        await navigator.mediaDevices.getUserMedia(
            constraints
        );

    state.cameraStream = stream;

    video.srcObject = stream;

    await new Promise((resolve, reject) => {

        video.onloadedmetadata = resolve;

        video.onerror = () => {
            reject(
                new Error("Camera video could not be loaded.")
            );
        };

    });

    await video.play();

    cameraPlaceholder.hidden = true;
    cameraError.hidden = true;

    cameraStatus.textContent = "Connected";

    resizeCanvas();

}


/* ============================================
   9. CAMERA CLEANUP
   ============================================ */

function stopCamera() {

    if (state.cameraStream) {

        state.cameraStream
            .getTracks()
            .forEach(track => track.stop());

        state.cameraStream = null;
    }

    video.pause();
    video.srcObject = null;

    cameraPlaceholder.hidden = false;

    cameraStatus.textContent = "Not Connected";

    clearCanvas();
}


/* ============================================
   10. CANVAS MANAGEMENT
   ============================================ */

function resizeCanvas() {

    if (!video.videoWidth || !video.videoHeight) {
        return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
}

function clearCanvas() {

    ctx.clearRect(
        0,
        0,
        canvas.width,
        canvas.height
    );
}


/* ============================================
   11. POSE DETECTION
   ============================================ */

function isLandmarkVisible(landmark) {

    return (
        landmark &&
        typeof landmark.visibility === "number" &&
        landmark.visibility >= CONFIG.minimumVisibility
    );
}

function getVisiblePose(landmarks) {

    if (!landmarks || landmarks.length < 33) {
        return false;
    }

    const requiredPoints = [
        11, 12,
        15, 16,
        23, 24,
        27, 28
    ];

    return requiredPoints.every(index =>
        isLandmarkVisible(landmarks[index])
    );
}

function drawPose(landmarks) {

    if (!state.drawingUtils || !landmarks) {
        return;
    }

    clearCanvas();

    state.drawingUtils.drawConnectors(
        landmarks,
        PoseLandmarker.POSE_CONNECTIONS,
        {
            color: "#00E5B0",
            lineWidth: 3
        }
    );

    state.drawingUtils.drawLandmarks(
        landmarks,
        {
            color: "#FFFFFF",
            fillColor: "#00B894",
            lineWidth: 1,
            radius: 4
        }
    );
}


/* ============================================
   12. LANDMARK HELPERS
   ============================================ */

function midpoint(pointA, pointB) {

    return {
        x: (pointA.x + pointB.x) / 2,
        y: (pointA.y + pointB.y) / 2
    };
}

function distance(pointA, pointB) {

    return Math.sqrt(
        Math.pow(pointA.x - pointB.x, 2) +
        Math.pow(pointA.y - pointB.y, 2)
    );
}

function getBodyMeasurements(landmarks) {

    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];

    const leftWrist = landmarks[15];
    const rightWrist = landmarks[16];

    const leftHip = landmarks[23];
    const rightHip = landmarks[24];

    const leftAnkle = landmarks[27];
    const rightAnkle = landmarks[28];

    return {

        shoulderCenter: midpoint(
            leftShoulder,
            rightShoulder
        ),

        hipCenter: midpoint(
            leftHip,
            rightHip
        ),

        ankleCenter: midpoint(
            leftAnkle,
            rightAnkle
        ),

        leftWrist,
        rightWrist,

        leftAnkle,
        rightAnkle,

        shoulderWidth: distance(
            leftShoulder,
            rightShoulder
        ),

        ankleDistance: distance(
            leftAnkle,
            rightAnkle
        )
    };
}


/* ============================================
   13. JUMPING JACKS DETECTION
   ============================================ */

function detectJumpingJacks(landmarks, now) {

    const body = getBodyMeasurements(landmarks);

    const settings = CONFIG.jumpingJacks;

    const wristsAboveHead =
        body.leftWrist.y <
            body.shoulderCenter.y -
            settings.openWristMargin &&

        body.rightWrist.y <
            body.shoulderCenter.y -
            settings.openWristMargin;

    const wristsNearBody =
        body.leftWrist.y >
            body.shoulderCenter.y +
            settings.closedWristMargin &&

        body.rightWrist.y >
            body.shoulderCenter.y +
            settings.closedWristMargin;

    const legsOpen =
        body.ankleDistance >
        settings.openLegDistance;

    const legsClosed =
        body.ankleDistance <
        settings.closedLegDistance;

    const isOpen =
        wristsAboveHead && legsOpen;

    const isClosed =
        wristsNearBody && legsClosed;

    if (state.exercisePhase === "ready") {

        if (isOpen) {
            state.exercisePhase = "open";
        }

        return;
    }

    if (state.exercisePhase === "open") {

        if (isClosed) {

            state.totalCount++;

            state.exercisePhase = "ready";

            updateCounters();

            updateStatus(
                "Jumping Jacks: " +
                state.totalCount +
                " completed."
            );
        }
    }
}


/* ============================================
   14. JUMP ROPE DETECTION
   ============================================ */

function detectJumpRope(landmarks, now) {

    const body = getBodyMeasurements(landmarks);

    const hipHeight = body.hipCenter.y;

    const settings = CONFIG.jumpRope;

    if (state.jumpRopeBaseline === null) {

        state.jumpRopeBaselineSamples.push(hipHeight);

        if (
            state.jumpRopeBaselineSamples.length >=
            settings.baselineSamples
        ) {

            const samples =
                state.jumpRopeBaselineSamples;

            state.jumpRopeBaseline =
                samples.reduce(
                    (sum, value) => sum + value,
                    0
                ) / samples.length;

            state.exercisePhase = "ready";

            updateStatus(
                "Jump Rope baseline established. Start jumping."
            );
        }

        return;
    }

    const verticalMovement =
        state.jumpRopeBaseline - hipHeight;

    if (!state.jumpRopeAirborne) {

        if (
            verticalMovement >
            settings.jumpThreshold
        ) {

            state.jumpRopeAirborne = true;

            state.jumpRopePeak = now;

            state.exercisePhase = "airborne";
        }

        return;
    }

    if (verticalMovement > settings.jumpThreshold) {

        state.jumpRopePeak = now;

        return;
    }

    const jumpDuration =
        now - state.jumpRopePeak;

    const hasLanded =
        verticalMovement <
        settings.landingThreshold;

    if (hasLanded) {

        state.jumpRopeAirborne = false;

        state.exercisePhase = "ready";

        const validDuration =
            jumpDuration >= settings.minimumJumpDuration &&
            jumpDuration <= settings.maximumJumpDuration;

        const debouncePassed =
            now - state.jumpRopeLastCountTime >=
            settings.debounceTime;

        if (validDuration && debouncePassed) {

            state.totalCount++;

            state.jumpRopeLastCountTime = now;

            updateCounters();

            updateStatus(
                "Jump Rope: " +
                state.totalCount +
                " completed."
            );
        }

        // Gradually adapt the baseline while grounded.
        state.jumpRopeBaseline =
            state.jumpRopeBaseline * 0.95 +
            hipHeight * 0.05;
    }
}


/* ============================================
   15. EXERCISE PROCESSING
   ============================================ */

function processExercise(landmarks, now) {

    if (state.selectedExercise === "jumping-jacks") {

        detectJumpingJacks(landmarks, now);

    } else if (state.selectedExercise === "jump-rope") {

        detectJumpRope(landmarks, now);

    }
}


/* ============================================
   16. MAIN AI TRACKING LOOP
   ============================================ */

function trackingLoop() {

    if (!state.isRunning) {
        return;
    }

    if (
        video.readyState >= 2 &&
        video.currentTime !== state.lastVideoTime
    ) {

        state.lastVideoTime = video.currentTime;

        const now = performance.now();

        try {

            const results =
                state.poseLandmarker.detectForVideo(
                    video,
                    now
                );

            if (
                results.landmarks &&
                results.landmarks.length > 0
            ) {

                const landmarks =
                    results.landmarks[0];

                if (getVisiblePose(landmarks)) {

                    drawPose(landmarks);

                    updateBodyStatus("Body Detected");

                    processExercise(
                        landmarks,
                        now
                    );

                    state.previousPose = landmarks;

                } else {

                    clearCanvas();

                    updateBodyStatus(
                        "Position Full Body in Camera"
                    );
                }

            } else {

                clearCanvas();

                updateBodyStatus("No Body Detected");
            }

            state.lastDetectionTime = now;

        } catch (error) {

            console.error(
                "AI tracking error:",
                error
            );

            if (!state.processingErrorShown) {

                state.processingErrorShown = true;

                updateStatus(
                    "AI tracking encountered an error."
                );
            }
        }
    }

    state.animationFrameId =
        requestAnimationFrame(trackingLoop);
}


/* ============================================
   17. WORKOUT TIMER
   ============================================ */

function startTimer() {

    state.startTime = Date.now();

    state.elapsedSeconds = 0;

    updateDuration();

    state.timerInterval = setInterval(() => {

        if (!state.isRunning) {
            return;
        }

        state.elapsedSeconds = Math.floor(
            (Date.now() - state.startTime) / 1000
        );

        updateDuration();

    }, 1000);
}

function stopTimer() {

    if (state.timerInterval) {

        clearInterval(state.timerInterval);

        state.timerInterval = null;
    }

    if (state.startTime) {

        state.elapsedSeconds = Math.floor(
            (Date.now() - state.startTime) / 1000
        );

        updateDuration();
    }
}


/* ============================================
   18. START WORKOUT
   ============================================ */

async function startWorkout() {

    if (state.isRunning || state.isStarting) {
        return;
    }

    state.isStarting = true;

    startButton.disabled = true;
    stopButton.disabled = true;

    resultsSection.hidden = true;

    hideCameraError();

    resetWorkoutData();

    updateStatus("Initializing camera and AI...");

    updateSystemStatus(
        "Initializing",
        "#f1c40f"
    );

    updateCameraStatus("Connecting...");
    updateAIStatus("Loading...");
    updateBodyStatus("Waiting");

    try {

        await startCamera();

        await initializeAI();

        state.isRunning = true;

        state.isStarting = false;

        startButton.disabled = true;
        stopButton.disabled = false;

        updateSystemStatus(
            "System Active",
            "#00b894"
        );

        updateAIStatus("Tracking Active");

        updateStatus(
            "AI is active. Position your full body in the camera."
        );

        startTimer();

        state.animationFrameId =
            requestAnimationFrame(trackingLoop);

    } catch (error) {

        console.error(
            "Workout initialization error:",
            error
        );

        state.isRunning = false;
        state.isStarting = false;

        stopCamera();

        startButton.disabled = false;
        stopButton.disabled = true;

        updateSystemStatus(
            "System Error",
            "#e74c3c"
        );

        updateAIStatus("Not Started");

        updateBodyStatus("Waiting");

        updateStatus(
            "Unable to start workout."
        );

        let message =
            "Unable to initialize the camera or AI.";

        if (error.name === "NotAllowedError") {

            message =
                "Camera permission denied. Allow camera access in your browser settings.";

        } else if (error.name === "NotFoundError") {

            message =
                "No compatible camera was found.";

        } else if (error.name === "NotReadableError") {

            message =
                "Camera is already being used by another application.";

        } else if (error.name === "NotSupportedError") {

            message =
                "Your browser does not support the required camera features.";

        } else if (error.message) {

            message = error.message;
        }

        showCameraError(message);
    }
}


/* ============================================
   19. STOP WORKOUT
   ============================================ */

function stopWorkout() {

    if (!state.isRunning) {
        return;
    }

    state.isRunning = false;

    if (state.animationFrameId !== null) {

        cancelAnimationFrame(
            state.animationFrameId
        );

        state.animationFrameId = null;
    }

    stopTimer();

    // An unfinished movement is counted separately.
    if (
        state.selectedExercise === "jumping-jacks" &&
        state.exercisePhase === "open"
    ) {

        state.incompleteCount++;

    } else if (
        state.selectedExercise === "jump-rope" &&
        state.jumpRopeAirborne
    ) {

        state.incompleteCount++;
    }

    stopCamera();

    updateCounters();

    startButton.disabled = false;
    stopButton.disabled = true;

    updateSystemStatus(
        "System Ready",
        "#00b894"
    );

    updateAIStatus("Stopped");

    updateBodyStatus("Waiting");

    updateStatus(
        "Workout completed. Your results are ready."
    );

    showWorkoutResults();
}


/* ============================================
   20. WORKOUT RESULTS
   ============================================ */

function showWorkoutResults() {

    const exerciseName =
        state.selectedExercise === "jumping-jacks"
            ? "Jumping Jacks"
            : "Jump Rope";

    resultExercise.textContent = exerciseName;

    resultTotal.textContent =
        state.totalCount;

    resultIncomplete.textContent =
        state.incompleteCount;

    resultDuration.textContent =
        formatTime(state.elapsedSeconds);

    resultsSection.hidden = false;

    resultsSection.scrollIntoView({
        behavior: "smooth",
        block: "nearest"
    });
}


/* ============================================
   21. CAMERA SELECTION CHANGES
   ============================================ */

cameraSelect.addEventListener("change", async () => {

    if (!state.isRunning) {
        return;
    }

    updateStatus(
        "Switching camera..."
    );

    if (state.animationFrameId !== null) {

        cancelAnimationFrame(
            state.animationFrameId
        );

        state.animationFrameId = null;
    }

    try {

        stopCamera();

        await startCamera();

        state.lastVideoTime = -1;

        state.animationFrameId =
            requestAnimationFrame(trackingLoop);

        updateStatus(
            "Camera switched successfully. Continue your workout."
        );

    } catch (error) {

        console.error(
            "Camera switching error:",
            error
        );

        stopWorkout();

        showCameraError(
            "Unable to switch camera. Please check camera permissions and try again."
        );
    }
});


/* ============================================
   22. BUTTON EVENTS
   ============================================ */

startButton.addEventListener(
    "click",
    startWorkout
);

stopButton.addEventListener(
    "click",
    stopWorkout
);


/* ============================================
   23. PAGE INITIALIZATION
   ============================================ */

function initializeApplication() {

    resetWorkoutData();

    startButton.disabled = false;
    stopButton.disabled = true;

    cameraPlaceholder.hidden = false;

    cameraStatus.textContent = "Not Connected";
    aiStatus.textContent = "Not Started";
    bodyStatus.textContent = "Waiting";

    updateSystemStatus(
        "System Ready",
        "#00b894"
    );

    updateStatus(
        "Select an exercise and press START."
    );

    console.log(
        "ASP AI Movement Counter initialized."
    );
}

initializeApplication();


/* ============================================
   END OF ASP AI MOVEMENT COUNTER
   ============================================ */
