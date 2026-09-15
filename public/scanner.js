import { productCode, normalizeProduct } from "./scan-model.js";

let decoderLoading;
export function loadDecoder() {
  if (!decoderLoading)
    decoderLoading = import("./vendor/zxing-browser.min.js")
      .then(() => {
        if (!globalThis.ZXingBrowser) throw Error("Scanner could not load.");
        return globalThis.ZXingBrowser;
      })
      .catch((error) => {
        decoderLoading = null;
        throw error;
      });
  return decoderLoading;
}
const cache = new Map();
let lastRequest = 0;

export function mountScanner(root, { onProduct, onManual, findSaved }) {
  root.innerHTML = `<p class="scan-intro">Point your camera at a food package’s barcode or product QR code.</p>
    <div class="scan-camera"><video id="scan-video" playsinline muted aria-label="Barcode camera preview"></video><div class="scan-guide" aria-hidden="true"></div><span class="scan-camera-label">KEEP THE WHOLE CODE IN VIEW</span></div>
    <p id="scan-status" class="scan-status" role="status">Camera is off. Start when you’re ready.</p>
    <div class="button-row scan-controls"><button id="start-camera" class="primary">Start camera</button><button id="stop-camera" hidden>Stop camera</button><button id="choose-photo">Use a photo</button></div>
    <input id="scan-photo" type="file" accept="image/*" class="sr-only" aria-label="Photo of product barcode">
    <form id="barcode-form" class="barcode-form"><label class="field">Or type the barcode / paste a product QR link<input name="code" id="barcode-input" maxlength="2048" autocomplete="off" placeholder="e.g. 3017620422003" required></label><button id="lookup-product" type="submit">Find product</button></form>
    <button id="manual-product" class="text-button">Enter the package label myself</button>
    <p class="help scan-privacy">Camera frames and photos stay on this device. Looking up a product sends only its barcode to <a href="https://world.openfoodfacts.org/" target="_blank" rel="noopener noreferrer">Open Food Facts</a>. New lookups need internet. QR codes must include a product identifier.</p>`;
  const $ = (s) => root.querySelector(s);
  let active = true,
    operation = 0,
    stream,
    controls,
    request,
    photoUrl;
  const status = (message) => {
    if (active) $("#scan-status").textContent = message;
  };
  const stopCamera = () => {
    controls?.stop();
    controls = null;
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    const video = $("#scan-video");
    if (video) video.srcObject = null;
    if (active) {
      $("#start-camera").disabled = false;
      $("#stop-camera").hidden = true;
      $("#lookup-product").disabled = false;
    }
  };
  const lookup = async (raw) => {
    const token = ++operation;
    stopCamera();
    request?.abort();
    let code;
    try {
      code = productCode(raw);
    } catch (error) {
      status(error.message);
      return;
    }
    $("#barcode-input").value = code;
    const saved = findSaved(code) || cache.get(code);
    if (saved) {
      onProduct({ ...saved });
      return;
    }
    if (!navigator.onLine) {
      status(
        "You’re offline. Enter the label manually, or reconnect to look up a new product.",
      );
      return;
    }
    if (Date.now() - lastRequest < 4500) {
      status("Please wait a few seconds before another lookup.");
      return;
    }
    lastRequest = Date.now();
    request = new AbortController();
    const timeout = setTimeout(() => request?.abort(), 12000);
    $("#lookup-product").disabled = true;
    status("Looking up the product…");
    try {
      const fields =
        "code,product_name,product_name_en,brands,quantity,product_quantity,product_quantity_unit,serving_size,nutrition,nutriments";
      const response = await fetch(
        `https://world.openfoodfacts.org/api/v3.6/product/${code}.json?fields=${fields}`,
        {
          signal: request.signal,
          credentials: "omit",
          referrerPolicy: "no-referrer",
          headers: {
            "X-User-Agent":
              "ByteMilad/1.1 (https://github.com/ahadx-12/byte-calorie-tracker)",
          },
        },
      );
      if (!active || token !== operation) return;
      if (response.status === 429)
        throw Error(
          "The food database is busy. Wait a minute or enter the label manually.",
        );
      if (response.status === 404)
        throw Error(
          "Product not found. You can still enter its package label below.",
        );
      if (!response.ok)
        throw Error(
          "The food database is unavailable. Try again later or enter the label manually.",
        );
      const data = await response.json();
      if (!active || token !== operation) return;
      if (!data.product || data.status === 0 || data.status === "failure")
        throw Error(
          "Product not found. You can still enter its package label below.",
        );
      const product = normalizeProduct(data.product, code);
      cache.set(code, product);
      onProduct(product);
    } catch (error) {
      if (active && token === operation)
        status(
          error.name === "AbortError"
            ? "Lookup timed out. Try again or enter the label manually."
            : error instanceof TypeError
              ? "Couldn’t reach the food database. Check your connection or enter the label manually."
              : error.message,
        );
    } finally {
      clearTimeout(timeout);
      if (active && token === operation) $("#lookup-product").disabled = false;
    }
  };
  $("#barcode-form").onsubmit = (e) => {
    e.preventDefault();
    lookup($("#barcode-input").value);
  };
  $("#manual-product").onclick = () => onManual();
  $("#stop-camera").onclick = () => {
    operation++;
    stopCamera();
    status("Camera stopped. You can also type the code.");
  };
  $("#start-camera").onclick = async () => {
    const token = ++operation;
    request?.abort();
    stopCamera();
    $("#start-camera").disabled = true;
    status(
      "Allow camera access to scan. Use a photo or type the barcode if access is unavailable.",
    );
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
        throw Error(
          "Camera access needs HTTPS and a supported browser. Open this app in Safari, use a photo, or type the barcode.",
        );
      const ZXing = await loadDecoder();
      if (!active || token !== operation) return;
      const acquired = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      if (!active || token !== operation) {
        acquired.getTracks().forEach((t) => t.stop());
        return;
      }
      stream = acquired;
      $("#stop-camera").hidden = false;
      status("Scanning… Hold the package steady in good light.");
      const reader = new ZXing.BrowserMultiFormatReader(undefined, {
        delayBetweenScanAttempts: 300,
        delayBetweenScanSuccess: 1000,
      });
      const started = await reader.decodeFromStream(
        stream,
        $("#scan-video"),
        (result, error, control) => {
          if (!active || token !== operation || !result) return;
          control.stop();
          lookup(result.getText());
        },
      );
      if (!active || token !== operation) started.stop();
      else controls = started;
    } catch (error) {
      if (active && token === operation) {
        stopCamera();
        status(
          error.name === "NotAllowedError"
            ? "Camera access was denied. You can allow it in Safari’s website settings, use a photo, or type the code."
            : error.name === "NotFoundError"
              ? "No camera was found. Use a photo or type the barcode."
              : error.name === "NotReadableError"
                ? "The camera is busy. Close other camera apps, or use a photo."
                : error.message,
        );
      }
    }
  };
  $("#choose-photo").onclick = () => $("#scan-photo").click();
  $("#scan-photo").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    let currentPhotoUrl;
    const token = ++operation;
    stopCamera();
    request?.abort();
    status("Reading the code in your photo…");
    try {
      if (file.size > 20 * 1024 * 1024)
        throw Error("Choose a photo smaller than 20 MB.");
      const ZXing = await loadDecoder();
      if (!active || token !== operation) return;
      currentPhotoUrl = URL.createObjectURL(file);
      photoUrl = currentPhotoUrl;
      const img = new Image();
      img.src = currentPhotoUrl;
      await img.decode();
      if (!active || token !== operation) return;
      const result =
        await new ZXing.BrowserMultiFormatReader().decodeFromImageElement(img);
      if (active && token === operation) lookup(result.getText());
    } catch (error) {
      if (active && token === operation)
        status(
          error.message === "Choose a photo smaller than 20 MB."
            ? error.message
            : "No readable code found. Try a sharp, close-up photo with the whole barcode visible, or type the printed numbers.",
        );
    } finally {
      if (currentPhotoUrl) URL.revokeObjectURL(currentPhotoUrl);
      if (photoUrl === currentPhotoUrl) photoUrl = null;
      e.target.value = "";
    }
  };
  const visibility = () => {
    if (document.hidden) {
      operation++;
      stopCamera();
      request?.abort();
      status("Camera paused. Tap Start camera to continue.");
    }
  };
  document.addEventListener("visibilitychange", visibility);
  return () => {
    active = false;
    operation++;
    request?.abort();
    stopCamera();
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    document.removeEventListener("visibilitychange", visibility);
  };
}
