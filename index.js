var jwt = require("jsonwebtoken");
const uuid = require("uuid");

GCLOUD_FIRESTORE_ENDPOINT = "https://firestore.googleapis.com/v1";
GOOGLE_OAUTH_ENDPOINT = "https://oauth2.googleapis.com/token";

let accessToken = null;
let accessTokenExp = null;

addEventListener("fetch", (event) => {
  try {
    event.respondWith(handleEvent(event));
  } catch (e) {
    event.respondWith(new Response("Internal error", { status: 500 }));
  }
});

/**
 * Primary event handler
 */
async function handleEvent(event) {
  let payload;
  const request = event.request;

  if (request.method == "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "https://george.black",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Accept-CH": "UA, Platform, Model, Arch, Viewport-Width, Width",
        "Accept-CH-Lifetime": "2592000",
      },
    });
  }

  if (request.method != "POST") {
    return new Response("Method not allowed!", { status: 405 });
  }

  try {
    payload = await request.json();
  } catch (err) {
    return new Response("Bad request! Yikes.", { status: 400 });
  }

  if (!validRequestPayload(payload)) {
    return new Response("Bad request! Yikes.", { status: 400 });
  }

  // build document
  const firestoreDocument = {
    fields: {
      hostname: {
        stringValue: payload.hostname,
      },
      pathname: {
        stringValue: payload.pathname,
      },
      windowInnerWidth: {
        integerValue: payload.windowInnerWidth,
      },
      timezone: {
        stringValue: payload.timezone,
      },
      dataCenterCode: {
        stringValue: request.cf.colo,
      },
      timestamp: {
        timestampValue: new Date().toISOString(),
      },
    },
  };
  if (request.headers.get("user-agent")) {
    firestoreDocument.fields.userAgent = {
      stringValue: request.headers.get("user-agent"),
    };
  }
  if (payload.referrer) {
    firestoreDocument.fields.referrer = {
      stringValue: payload.referrer,
    };
  }
  if (request.cf.country) {
    firestoreDocument.fields.countryCode = {
      stringValue: request.cf.country,
    };
  }

  event.waitUntil(postToCloudFirestore(firestoreDocument));
  return new Response("Thanks for visiting! :)", {
    headers: {
      "Access-Control-Allow-Origin": "https://george.black",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Accept-CH": "UA, Platform, Model, Arch, Viewport-Width, Width",
      "Accept-CH-Lifetime": "2592000",
    },
  });
}

async function postToCloudFirestore(document) {
  if (!validAccessTokenExists()) await refreshAccessToken();

  await fetch(
    `${GCLOUD_FIRESTORE_ENDPOINT}/projects/${GCLOUD_PROJECT_ID}/databases/(default)/documents/web-views?documentId=${uuid.v4()}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(document),
    }
  );
}

async function refreshAccessToken() {
  const [assertion, issuedAt] = buildAuthAssertion();

  const response = await fetch(GOOGLE_OAUTH_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: assertion,
    }),
  });

  const responseBody = await response.json();
  const expiresInMilliseconds = responseBody["expires_in"] * 1000;
  accessToken = responseBody["access_token"];
  accessTokenExp = new Date(
    issuedAt.getTime() + expiresInMilliseconds - 300000
  ); // 5 minutes
}

function validRequestPayload(payload) {
  return (
    typeof payload.hostname === "string" &&
    payload.hostname !== "" &&
    typeof payload.pathname === "string" &&
    payload.pathname !== "" &&
    typeof payload.referrer === "string" &&
    typeof payload.windowInnerWidth === "number" &&
    Number.isInteger(payload.windowInnerWidth) &&
    typeof payload.timezone === "string" &&
    payload.timezone !== ""
  );
}

function buildAuthAssertion() {
  const issuedAt = new Date();
  const expiration = new Date(issuedAt.getTime() + 600000); // 10 minutes
  const claimSet = {
    iss: GCLOUD_SERVICE_ACCOUNT_EMAIL,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    exp: Math.floor(expiration.getTime() / 1000),
    iat: Math.floor(issuedAt.getTime() / 1000),
  };
  const token = jwt.sign(claimSet, getServiceAccountKey(), {
    algorithm: "RS256",
  });
  return [token, issuedAt];
}

function validAccessTokenExists() {
  if (!accessToken) return false;
  return accessTokenExp > new Date();
}

/**
 * Env vars have a 1 KiB size limit, and service account keys are slightly larger.
 * The service account key is split into two env vars.
 */
function getServiceAccountKey() {
  return GCLOUD_SERVICE_ACCOUNT_KEY_1 + GCLOUD_SERVICE_ACCOUNT_KEY_2;
}
