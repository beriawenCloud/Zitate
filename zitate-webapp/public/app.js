const form = document.querySelector("#quote-form");
const categorySelect = document.querySelector("#category");
const statusEl = document.querySelector("#status");
const accessField = document.querySelector("#access-field");
const accessCodeInput = document.querySelector("#accessCode");
const savedAccessCode = localStorage.getItem("zitateAccessCode") || "";
let appConfig = {};

accessCodeInput.value = savedAccessCode;

function setStatus(message, type = "") {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`.trim();
}

async function loadCategories() {
  const configResponse = await fetch("/api/config");
  appConfig = await configResponse.json();
  accessField.hidden = !appConfig.accessRequired;

  const response = await fetch("/api/categories");
  const data = await response.json();

  categorySelect.innerHTML = "";
  for (const category of data.categories) {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    categorySelect.append(option);
  }
}

function getFormData() {
  const data = new FormData(form);
  return {
    accessCode: data.get("accessCode"),
    quote: data.get("quote"),
    category: data.get("category"),
    source: data.get("source"),
    medium: data.get("medium"),
    year: data.get("year"),
    speaker: data.get("speaker"),
    language: data.get("language"),
    tags: data.get("tags"),
    mood: data.get("mood"),
    reason: data.get("reason"),
    suitableFor: data.get("suitableFor")
  };
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("Speichere ...");

  try {
    const payload = getFormData();
    const headers = { "content-type": "application/json" };
    if (payload.accessCode) {
      headers["x-access-code"] = payload.accessCode;
    }

    const response = await fetch("/api/quotes", {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || "Speichern fehlgeschlagen.");
    }

    const target = result.storageMode === "github"
      ? `${appConfig.githubRepo}:${result.file}`
      : result.file;
    setStatus(`Gespeichert in ${target}.`, "ok");
    localStorage.setItem("zitateAccessCode", payload.accessCode || "");
    form.reset();
    accessCodeInput.value = payload.accessCode || "";
    categorySelect.value = result.category;
    document.querySelector("#quote").focus();
  } catch (error) {
    setStatus(error.message, "error");
  }
});

loadCategories().catch(() => {
  setStatus("Kategorien konnten nicht geladen werden.", "error");
});
