export const VALIDATOR_GEO_MAPPING: Record<string, ValidatorGeoData> = {
  "028986e40f8e9f39bf68fa5f2f8de58514b124a150261a340e13940d286c0c7317": {
    country: "Test Country",
    city: "Test City",
    provider: "Test Provider"
  },

  // Active validators with known geographic/infrastructure data
  // Add validators here as their location information becomes available
  
  // Example: Luganodes (Switzerland) - ID 76
  // "0237534fc1ff5118f436ab78d5dbe9cb96147b6290460b7517e02895f8aa9f866c": {
  //   country: "Switzerland",
  //   city: "Zurich",
  //   provider: "Luganodes"
  // },
  
  // Inactive validators (included in metadata but not in epoch)
  // These can be enriched from this mapping even though they're not in active geolocation endpoint
  
  // Example: Monad Foundation - Inactive (France) - ID 1
  // "038922d0d2bc9f80823b27ce6520357534ad82764cfc8115668344e3fc9c1ec2c5": {
  //   country: "France",
  //   city: "Paris",
  //   provider: "Monad Foundation"
  // },
  
  // Example: Monad Foundation - Inactive (USA) - ID 2
  // "030658fba49d3686faea21a9219e24cfe0881f03f06dc44de5c0b58da4da33de96": {
  //   country: "United States",
  //   city: "New York",
  //   provider: "Monad Foundation"
  // },
  
  // ===== POPULATE THIS SECTION WITH VALIDATOR DATA =====
  // Add entries for all validators with known geographic data
  // See VALIDATOR_MAPPING_GUIDE.md for detailed instructions
};