# Test-Odin: Ubuntu wie auf Odin, ohne Node.js (das installiert install.sh selbst).
# Nur für Entwicklung und Tests – siehe README.md.
FROM ubuntu:26.04
RUN apt-get update -q \
 && apt-get install -y -q --no-install-recommends iproute2 openssl nftables procps ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY systemctl journalctl /usr/local/bin/
RUN chmod 755 /usr/local/bin/systemctl /usr/local/bin/journalctl
CMD ["sleep", "infinity"]
