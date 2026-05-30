---
title: "Deploy the Bolt landing page (bolt.trevormil.com)"
last-verified: 2026-05-30
---

# Deploy the Bolt landing page

The standalone marketing splash (`packages/web/landing/index.html` + `bolt.png`)
serves at **https://bolt.trevormil.com** out of the shared DigitalOcean
Kubernetes cluster.

Single-namespace, single-Deployment, single-Service, single-Ingress. The image
is a thin `nginx:alpine` layer with the HTML + PNG baked in. Hand-edits to the
landing happen in-repo; redeploy is a rebuild + image push + `kubectl rollout
restart`.

## Cluster + registry pre-reqs (set up once)

- Cluster: DO sfo2 (`do-sfo2-k8s-1-35-1-do-3-sfo2-1777411058629`), reached via
  `doctl kubernetes cluster kubeconfig save <cluster-id>`.
- Ingress IP: `159.89.222.96` (shared with every other `*.trevormil.com` app).
- cert-manager + `letsencrypt-prod` ClusterIssuer + ingress-nginx already
  installed on the cluster.
- Image registry: **GHCR** (`ghcr.io/trevormil/bolt-landing`). The DO registry
  hit its 5-repo plan limit, so GHCR is the path of least resistance. Package
  is private; the `bolt-landing` namespace holds an `imagePullSecrets`-attached
  `ghcr-pull` docker-registry secret backed by a GH PAT.
- DNS: `bolt.trevormil.com` A record → `159.89.222.96`, TTL 300, in
  `trevormil.com` zone on DigitalOcean.

## First-time deploy (replay)

```bash
cd packages/web/landing

# 1. Build + push the image (linux/amd64, the cluster node arch).
docker buildx build --platform linux/amd64 \
  -t ghcr.io/trevormil/bolt-landing:latest \
  --push .

# 2. Create the namespace + the GHCR pull secret (one-time).
kubectl apply -f k8s/namespace.yaml
GH_TOKEN=$(gh auth token)
kubectl -n bolt-landing create secret docker-registry ghcr-pull \
  --docker-server=ghcr.io \
  --docker-username=trevormil \
  --docker-password="$GH_TOKEN" \
  --docker-email=trevormiller23@gmail.com

# 3. Apply the rest.
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/ingress.yaml

# 4. Add the DNS record (one-time).
doctl compute domain records create trevormil.com \
  --record-type A --record-name bolt \
  --record-data 159.89.222.96 --record-ttl 300

# 5. Wait for the rollout + cert.
kubectl -n bolt-landing rollout status deploy/bolt-landing
kubectl -n bolt-landing get cert bolt-trevormil-tls  # READY=True (~30-60s)
curl -I https://bolt.trevormil.com/                  # 200
```

## Updating the landing copy

Edit `packages/web/landing/index.html` (and/or `bolt.png`), then:

```bash
cd packages/web/landing
docker buildx build --platform linux/amd64 \
  -t ghcr.io/trevormil/bolt-landing:latest --push .
kubectl -n bolt-landing rollout restart deploy/bolt-landing
kubectl -n bolt-landing rollout status deploy/bolt-landing
```

The deployment uses `imagePullPolicy: Always` + the `:latest` tag, so the
rollout restart picks up the new digest. Pin to a content-addressed tag (e.g.
`:$(git rev-parse --short HEAD)`) if reproducibility matters more than
one-command publishes.

## Rotating the GHCR pull secret

The PAT in the `ghcr-pull` secret matches the GH token in
`gh auth token` at create time. If you ever rotate the GH token (or the
PAT in keychain), refresh the secret in-place:

```bash
GH_TOKEN=$(gh auth token)
kubectl -n bolt-landing delete secret ghcr-pull
kubectl -n bolt-landing create secret docker-registry ghcr-pull \
  --docker-server=ghcr.io \
  --docker-username=trevormil \
  --docker-password="$GH_TOKEN" \
  --docker-email=trevormiller23@gmail.com
kubectl -n bolt-landing rollout restart deploy/bolt-landing
```

## Sanity checks

```bash
# Pods running?
kubectl -n bolt-landing get pods

# Cert OK?
kubectl -n bolt-landing get cert
kubectl -n bolt-landing describe cert bolt-trevormil-tls  # if not Ready

# Reach the live site (verify chain)
curl -I https://bolt.trevormil.com/
```
