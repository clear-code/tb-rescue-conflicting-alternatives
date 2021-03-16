/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

import {
  configs,
  log,
} from '/common/common.js';
import * as Constants from '/common/constants.js';

configs.$loaded.then(() => {
});

browser.messageDisplay.onMessageDisplayed.addListener(async (tab, message) => {
  console.log('onmessageDisplayed ', tab, message);
});
