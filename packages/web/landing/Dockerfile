FROM nginx:1.27-alpine

# Static landing page (#53). No build step — index.html is hand-written
# and self-contained; the bolt.png lives next to it. nginx serves them
# directly with no rewrite rules.
COPY index.html /usr/share/nginx/html/index.html
COPY bolt.png /usr/share/nginx/html/bolt.png

# nginx:alpine already listens on :80 and uses the default config — no
# extra COPY needed. Use the package-provided non-root drop where
# possible (the base image already drops privileges for worker procs).
EXPOSE 80
