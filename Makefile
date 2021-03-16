PACKAGE = rescue-conflicting-alternatives@clear-code.com.xpi

INCLUDES = chrome.manifest \
           manifest.json \
           content/messenger-overlay.js \
           content/messenger-overlay.xul \
           defaults/preferences/rescue-conflicting-alternatives.js

all: xpi

xpi: $(PACKAGE)
	cd webextensions && make && cp ./*.xpi ../

$(PACKAGE):
	zip -r -9 $@ $(INCLUDES)

lint:
	cd webextensions && make lint

clean:
	rm -f $(PACKAGE)

.PHONY: all lint clean
