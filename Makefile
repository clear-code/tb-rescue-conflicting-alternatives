PACKAGE = rescue-conflicting-alternatives@clear-code.com.xpi

INCLUDES = chrome.manifest \
           manifest.json \
           content/messenger-overlay.js \
           content/messenger-overlay.xul \
           defaults/preferences/rescue-conflicting-alternatives.js

all: $(PACKAGE)

$(PACKAGE):
	zip -r -9 $@ $(INCLUDES)

clean:
	rm -f $(PACKAGE)

.PHONY: all clean
