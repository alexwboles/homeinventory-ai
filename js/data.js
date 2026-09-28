/* HomeInventory default data — rooms, categories, insurance guidance. Browser + node. */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else root.HomeInvData = Object.assign(root.HomeInvData || {}, factory());
})(typeof self !== "undefined" ? self : this, function () {

  var DEFAULT_ROOMS = [
    "Living Room", "Kitchen", "Primary Bedroom", "Bedroom 2",
    "Bathroom", "Home Office", "Garage", "Basement / Storage"
  ];

  var CATEGORIES = [
    "Electronics", "Appliances", "Furniture", "Jewelry & Watches",
    "Clothing", "Tools", "Sports & Outdoors", "Musical Instruments",
    "Collectibles & Art", "Kitchenware", "Other"
  ];

  var GUIDANCE = [
    {
      title: "Photograph everything",
      body: "Insurers settle claims faster when you can prove what you owned. Take a wide photo of each room plus close-ups of high-value items and their serial-number plates. HomeInventory stores one photo per item right in your browser."
    },
    {
      title: "Keep receipts and serial numbers",
      body: "Save purchase receipts (paper or photo) and record serial numbers for electronics and appliances. A serial number is often the single fastest way to prove ownership of a specific item."
    },
    {
      title: "Update after big purchases",
      body: "Add new items within a week of buying them. Most claims are underpaid simply because people forget what they owned — a running inventory removes the guesswork."
    },
    {
      title: "Store a copy off-site",
      body: "Use the CSV export or print view and keep a copy somewhere other than your home — email it to yourself or leave it with a relative. If the house is the loss, the inventory must survive it."
    },
    {
      title: "Know replacement cost vs. actual cash value",
      body: "Check whether your policy pays replacement cost (what it costs to buy new today) or actual cash value (replacement minus depreciation). Record what you paid and when — it helps your adjuster either way."
    }
  ];

  var PHOTO_MAX_BYTES = 500 * 1024; // data-URL cap per photo
  var PHOTO_MAX_DIM = 800;          // downscale target (px)

  return {
    DEFAULT_ROOMS: DEFAULT_ROOMS,
    CATEGORIES: CATEGORIES,
    GUIDANCE: GUIDANCE,
    PHOTO_MAX_BYTES: PHOTO_MAX_BYTES,
    PHOTO_MAX_DIM: PHOTO_MAX_DIM
  };
});
