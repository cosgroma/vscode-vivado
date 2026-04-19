.DEFAULT_GOAL := help

NPM ?= npm
PYTHON ?= python

.PHONY: help setup install install-docs compile watch lint test docs docs-serve mock-workspace check ci all

help:
	@echo "Development targets:"
	@echo "  make setup          Install extension and documentation dependencies"
	@echo "  make install        Install extension dependencies from package-lock.json"
	@echo "  make install-docs   Install documentation dependencies"
	@echo "  make compile        Compile the TypeScript extension"
	@echo "  make watch          Compile the TypeScript extension in watch mode"
	@echo "  make lint           Run ESLint"
	@echo "  make test           Run extension tests (npm pretest also compiles and lints)"
	@echo "  make docs           Build documentation with strict MkDocs checks"
	@echo "  make docs-serve     Serve documentation locally"
	@echo "  make mock-workspace Create the mock HLS workspace fixture"
	@echo "  make check          Run extension tests and documentation checks"

setup: install install-docs

install:
	$(NPM) ci

install-docs:
	$(PYTHON) -m pip install -r requirements-docs.txt

compile:
	$(NPM) run compile

watch:
	$(NPM) run watch

lint:
	$(NPM) run lint

test:
	$(NPM) test

docs:
	$(PYTHON) -m mkdocs build --strict

docs-serve:
	$(PYTHON) -m mkdocs serve

mock-workspace:
	$(NPM) run mock:workspace

check: test docs

ci all: check
