export const PROVIDERS = [
  {
    name: "Google",
    hostnamePattern: /google\./,
    pathPrefix: "/search",
    queryParam: "q"
  },
  {
    name: "Bing",
    hostnamePattern: /bing\.(com|net)/,
    pathPrefix: "/search",
    queryParam: "q"
  },
  {
    name: "DuckDuckGo",
    hostnamePattern: /duckduckgo\.com/,
    pathPrefix: "", 
    queryParam: "q"
  },
  {
    name: "Yahoo",
    hostnamePattern: /search\.yahoo\./,
    pathPrefix: "/search",
    queryParam: "p"
  }
];
