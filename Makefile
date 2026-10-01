.PHONY: demo run test check package install web web-dev web-test deploy deploy-docker helm-lint
PYTHON ?= python3
NPM ?= npm
HOST ?=

demo:
	$(PYTHON) -m duvora.server --demo
run:
	$(PYTHON) -m duvora.server
test:
	$(PYTHON) -m unittest discover -s tests -v
web:
	$(NPM) --prefix web ci --no-audit --no-fund
	$(NPM) --prefix web run build
web-dev:
	$(NPM) --prefix web run dev
web-test:
	$(NPM) --prefix web run typecheck
	$(NPM) --prefix web test
helm-lint:
	helm lint helm/duvora
check: test
	$(PYTHON) -m compileall -q duvora
	bash -n scripts/deploy-remote.sh scripts/deploy-container.sh
	@if [ -d web/node_modules ]; then $(MAKE) web-test; else echo "skip web-test (run make web first)"; fi
	@if command -v helm >/dev/null 2>&1; then $(MAKE) helm-lint; else echo "skip helm-lint (helm not installed)"; fi
package:
	$(PYTHON) scripts/package.py
install:
	$(PYTHON) -m pip install .
deploy:
	@test -n "$(HOST)" || (echo "usage: make deploy HOST=user@host" >&2; exit 2)
	./scripts/deploy-remote.sh $(HOST)
deploy-docker:
	@test -n "$(HOST)" || (echo "usage: make deploy-docker HOST=user@host" >&2; exit 2)
	./scripts/deploy-container.sh $(HOST)
