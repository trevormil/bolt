FROM nginx:1.27-alpine

# Static landing page (#53). No build step — index.html is hand-written
# and self-contained; the bolt.png lives next to it. nginx serves them
# directly with no rewrite rules.
COPY index.html /usr/share/nginx/html/index.html
COPY bolt.png /usr/share/nginx/html/bolt.png
# Self-hosted feedback widget. Vendored from
# ~/CompSci/gauntlet/beacon/packages/widget/dist/beacon.js because (a)
# @beacon/widget is not yet on npm and (b) adblockers (uBlock/AdGuard/
# Brave Shields) block any URL containing the "beacon" substring. Served
# from /widget.js so the script-tag URL is innocuous.
COPY widget.js /usr/share/nginx/html/widget.js
# Reverse-proxy /v1/* → beacon.trevormil.com so the widget submission
# stays on bolt.trevormil.com (avoids the "beacon" hostname for clients
# with stale DNS or aggressive privacy filters).
COPY nginx.conf /etc/nginx/conf.d/default.conf

# nginx:alpine already listens on :80 and uses the default config — no
# extra COPY needed. Use the package-provided non-root drop where
# possible (the base image already drops privileges for worker procs).
EXPOSE 80
