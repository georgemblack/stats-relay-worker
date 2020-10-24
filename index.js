const DEFAULT_HEADERS = {
  "Access-Control-Allow-Origin": "https://george.black",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Accept-CH": "UA, Platform, Model, Arch, Viewport-Width, Width",
  "Accept-CH-Lifetime": "2592000",
};

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
      headers: DEFAULT_HEADERS,
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
  const document = {
    hostname: payload.hostname,
    pathname: payload.pathname,
    windowInnerWidth: payload.windowInnerWidth,
    timezone: payload.timezone,
    dataCenterCode: request.cf.colo,
    timestamp: new Date().toISOString(),
  };

  if (request.headers.get("user-agent")) {
    document.userAgent = request.headers.get("user-agent");
  }
  if (payload.referrer) {
    document.referrer = payload.referrer;
  }
  if (request.cf.country) {
    document.countryCode = request.cf.country;
  }

  event.waitUntil(postToStatsCollector(document));
  return new Response("Thanks for visiting! :)", {
    headers: DEFAULT_HEADERS,
  });
}

async function postToStatsCollector(document) {
  await fetch(`${STATS_COLLECTOR_ENDPOINT}/stats, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${STATS_COLLECTOR_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(document),
  });
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
