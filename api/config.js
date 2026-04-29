module.exports = function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  response.status(200).json({
    mapboxToken: process.env.MAPBOX_TOKEN || process.env.MAPBOX_ACCESS_TOKEN || "",
  });
};
