// Original codes to read and write message data to a folder are from Header Tools Lite, made by Paolo "Kaosmos".
// See: https://addons.mozilla.org/thunderbird/addon/header-tools-lite/
(function(aGlobal) {
  const Cc = Components.classes;
  const Ci = Components.interfaces;
  const Cu = Components.utils;
  const Cr = Components.results;
  const Prefs = Cc['@mozilla.org/preferences;1'].getService(Ci.nsIPrefBranch);
  const { Promise } = Cu.import('resource://gre/modules/Promise.jsm', {});

  var ShowFirstBodyPart = {
    tryUpdateCurrentMessage : function() {
      var msguri = gFolderDisplay.selectedMessageUris[0];
      var context = {};
      var loader = new StreamMessageLoader(context);
      return loader.load(msguri)
        .then((aContext) => {
          var message = aContext.message;
          message = this.prepareMessage(message, aContext.hdr.Charset);
          message = this.cleanupMozHeaders(message);

          var updatedMessage = this.fixMultiplePlaintextBodies(message);
          if (updatedMessage == message)
            return;

          message = updatedMessage;
          message = this.markAsApplied(message);
          message = this.incrementDate(message, aContext.folder);

          var file = this.saveToTempFile(message);
          var replacer = new MessageReplacer(aContext);
          return replacer.replaceFromFile(file)
            .then((aContext) => {
              this.restoreState(aContext);
            });
        });
    },

    prepareMessage : function(aMessage, aCharset) {
      var converter = Cc['@mozilla.org/intl/scriptableunicodeconverter'].createInstance(Ci.nsIScriptableUnicodeConverter);
      var message = aMessage;
      if (aCharset) {
        converter.charset = aCharset;
        // hdr.Charset will not work with multipart messages, so we must try to extract the charset manually
      }
      else {
        try {
          let messageCut = aMessage.substring(aMessage.indexOf('charset=')+8, aMessage.indexOf('charset=')+35);
          let mailCharset = messageCut.match(/[^\s]+/).toString();
          mailCharset = mailCharset.replace(/\"/g, '');
          mailCharset = mailCharset.replace(/\'/g, '');
          converter.charset = mailCharset;
        }
        catch(e) {
          converter.charset = 'UTF-8';
        }
      }
      try {
        aMessage = converter.ConvertToUnicode(aMessage);
      }
      catch(e) {}
      aMessage = this.cleanCRLF(aMessage);
      try {
        aMessage = converter.ConvertFromUnicode(aMessage);
      }
      catch(e) {}
      return aMessage;
    },

    cleanCRLF : function(data) {
      /* This function forces all newline as CRLF; this is useful for some reasons
      1) this will make the message RFC2822 compliant
      2) this will fix some problems with IMAP servers that don't accept mixed newlines
      3) this will make easier to use regexps
      */
      var newData = data.replace(/\r/g, '');
      newData = newData.replace(/\n/g, '\r\n');
      return newData;
    },

    cleanupMozHeaders : function(aMessage) {
      // strips off some useless headers
      aMessage = aMessage.replace(/^From - .+\r\n/, '');
      aMessage = aMessage.replace(/X-Mozilla-Status.+\r\n/, '');
      aMessage = aMessage.replace(/X-Mozilla-Status2.+\r\n/, '');
      aMessage = aMessage.replace(/X-Mozilla-Keys.+\r\n/, '');
      return aMessage;
    },

    fixMultiplePlaintextBodies : function(aMessage) {
      let initialBodyFound = false;
      aMessage = aMessage.replace(/Content-Type: text\/plain/g, function(matched) {
        if (initialBodyFound) {
/* Instead, we should just add Content-Disposition hader and the name part like:
----
Content-Type: text\/plain;
 name="=?UTF-8?B?xxxxxxx?="
Content-Disposition: attachment;
 filename*0*=utf-8''xxxxx;
 filename*1*=xxxxx
----
*/
          return 'Content-Type: application/octet-stream';
        }
        initialBodyFound = true;
        return matched;
      });
      return aMessage;
    },

    markAsApplied : function(aMessage) {
      if (!Prefs.getBoolPref('extensions.hdrtoolslite.add_htl_header'))
        return aMessage;

      let now = new Date();
      let line = 'X-ShowFirstBodyPart: applied - '+now.toString();
      line = line.replace(/\(.+\)/, '');
      line = line.substring(0, 75);
      if (aMessage.indexOf('\nX-ShowFirstBodyPart: ') < 0)
        return aMessage.replace('\r\n\r\n','\r\n'+line+'\r\n\r\n');
      else
        return aMessage.replace(/\nX-ShowFirstBodyPart: .+\r\n/,'\n'+line+'\r\n');
    },

    incrementDate : function(aMessage, aFolder) {
      let isImap = aFolder.server.type == 'imap';
      if (!isImap || !Prefs.getBoolPref('extensions.hdrtoolslite.use_imap_fix'))
        return aMessage;

      let date = this.getOrigDate(aMessage);
      // Some IMAP provider (for ex. GMAIL) doesn't register changes in sorce if the main headers
      // are not different from an existing message. To work around this limit, the "Date" field is
      // modified, if necessary, adding a second to the time (or decreasing a second if second are 59)
      let newDate = date.replace(/(\d{2}):(\d{2}):(\d{2})/, function (str, p1, p2, p3) {
        var z = parseInt(p3) + 1;
        if (z > 59) z = 58;
        if (z < 10) z = '0'+z.toString();
        return p1+':'+p2+':'+z
      });
      return aMessage.replace(date, newDate);
    },

    // parses headers to find the original Date header, not present in nsImsgDbHdr
    getOrigDate : function(aText) {
      var dateOrig = '';
      var splitted = null;
      try {
        var str_message = aText;
        // This is the end of the headers
        var end = str_message.search(/\r?\n\r?\n/);
        if (str_message.indexOf('\nDate') > -1 && str_message.indexOf('\nDate') < end) {
          splitted =str_message.split('\nDate:');
        }
        else if (str_message.indexOf('\ndate') > -1 && str_message.indexOf('\ndate') < end) {
          splitted =str_message.split('\ndate:');
        }
        if (splitted) {
          dateOrig = splitted[1].split('\n')[0];
          dateOrig = dateOrig.replace(/ +$/, '');
          dateOrig = dateOrig.replace(/^ +/, '');
        }
      }
      catch(e) {}
      return dateOrig;
    },

    saveToTempFile : function(aMessage) {
      // creates the temporary file, where the modified message body will be stored
      var tempFile = Cc['@mozilla.org/file/directory_service;1'].getService(Ci.nsIProperties).get('TmpD', Ci.nsIFile);
      tempFile.append('HT.eml');
      tempFile.createUnique(0, 0600);
      var foStream = Cc['@mozilla.org/network/file-output-stream;1'].createInstance(Ci.nsIFileOutputStream);
      foStream.init(tempFile, 2, 0x200, false); // open as "write only"
      foStream.write(aMessage, aMessage.length);
      foStream.close();
      return tempFile;
    },

    restoreState : function(aContext) {
      gDBView.selectMsgByKey(aContext.key); // select message with modified headers/source
      var hdr = aContext.folder.GetMessageHeader(aContext.key);
      if (hdr.flags & 2) {
        aContext.folder.addMessageDispositionState(hdr, 0); //set replied if necessary
      }
      if (hdr.flags & 4096) {
        aContext.folder.addMessageDispositionState(hdr, 1); //set fowarded if necessary
      }
    }
  };

  // appends "hdr", "folder", and "message" to the context
  function StreamMessageLoader(aContext) {
    this.context = aContext;
  }
  StreamMessageLoader.prototype = {
    load : function(aURI) {
      var mms = messenger.messageServiceFromURI(aURI).QueryInterface(Ci.nsIMsgMessageService);
      this.context.hdr = mms.messageURIToMsgHdr(aURI);
      this.context.folder = this.context.hdr.folder;
      return new Promise((aResolve, aReject) => {
        this._resolver = aResolve;
        this._rejector = aReject;
        mms.streamMessage(aURI, this, null, null, false, null);
      });
    },

    // streamMessage listener
    QueryInterface : function(iid)  {
      if (iid.equals(Ci.nsIStreamListener) ||
          iid.equals(Ci.nsISupports))
        return this;

      throw Components.results.NS_NOINTERFACE;
    },

    onStartRequest : function (aRequest, aContext) {
      this.context.message = '';
    },

    onStopRequest : function (aRequest, aContext, aStatusCode) {
      // console.log('StreamMessageLoader.onStopRequest\n------\n' + this.context.message);
      this._resolver(this.context);
    },

    onDataAvailable : function (aRequest, aContext, aInputStream, aOffset, aCount) {
      var scriptStream = Cc['@mozilla.org/scriptableinputstream;1'].createInstance().QueryInterface(Ci.nsIScriptableInputStream);
      scriptStream.init(aInputStream);
      this.context.message += scriptStream.read(scriptStream.available());
    }
  };

  function MessageReplacer(aContext) {
    this.context = aContext;
  }
  MessageReplacer.prototype = {
    replaceFromFile : function(aFile) {
      let flags = this.context.hdr.flags;
      let keys = this.context.hdr.getStringProperty('keywords');

      // this is interesting: nsIMsgFolder.copyFileMessage seems to have a bug on Windows, when
      // the nsIFile has been already used by foStream (because of Windows lock system?), so we
      // must initialize another nsIFile object, pointing to the temporary file
      let fileSpec = Cc['@mozilla.org/file/local;1'].createInstance(Ci.nsILocalFile);
      fileSpec.initWithPath(aFile.path);

      let extService = Cc['@mozilla.org/uriloader/external-helper-app-service;1'].getService(Ci.nsPIExternalAppLauncher)
      extService.deleteTemporaryFileOnExit(fileSpec); // function's name says all!!!

      return new Promise((aResolve, aReject) => {
        this._resolver = aResolve;
        this._rejector = aReject;
        this._replaced = false;
        this._readyToFinish = false;
        let cs = Cc['@mozilla.org/messenger/messagecopyservice;1'].getService(Ci.nsIMsgCopyService);
        cs.CopyFileMessage(fileSpec, this.context.hdr.folder, null, false, flags, keys, this, msgWindow);
      });
    },

    tryResolve : function() {
      if (!this._replaced || !this._readyToFinish)
        return;
      this._resolver(this.context);
    },

    // copyFileMessage listener
    QueryInterface : function(iid) {
      if (iid.equals(Ci.nsIMsgCopyServiceListener) ||
          iid.equals(Components.interfaces.nsISupports))
        return this;

      throw Components.results.NS_NOINTERFACE;
    },
    GetMessageId: function (messageId) {},
    OnProgress: function (progress, progressMax) {},
    OnStartCopy: function () {},
    OnStopCopy: function (status) {
      if (status == 0) { // copy done
        let hdrs = Cc['@mozilla.org/array;1'].createInstance(Ci.nsIMutableArray);
        hdrs.appendElement(this.context.hdr, false);
        let noTrash = !Prefs.getBoolPref('extensions.hdrtoolslite.putOriginalInTrash');
        this.context.folder.deleteMessages(hdrs, null, noTrash, true, null, false);

        this._replaced = true;
        this.tryResolve();
      }
    },
    SetMessageKey: function (key) {
      this.context.key = key;
      // at this point, the message is already stored in local folders, but not yet in remote folders,
      // so for remote folders we use a folderListener
      if (this.context.folder.server.type == 'imap' || this.context.folder.server.type == 'news') {
        let watcher = new RemoteFolderWatcher(this.context);
        watcher.waitUntilAdded().then(() => {
          this._readyToFinish = true;
          this.tryResolve();
        });
      }
      else {
        setTimeout(() => {
          this._readyToFinish = true;
          this.tryResolve();
        }, 500);
      }
    }
  };

  // used just for remote folders
  function RemoteFolderWatcher(aContext) {
    this.context = aContext;
  }
  RemoteFolderWatcher.prototype = {
    waitUntilAdded : function() {
      return new Promise((aResolve, aReject) => {
        this._resolver = aResolve;
        this._rejector = aReject;
        Cc['@mozilla.org/messenger/services/session;1'].getService(Ci.nsIMsgMailSession).AddFolderListener(this, Ci.nsIFolderListener.all);
      });
    },

    // folder listener
    OnItemAdded: function(parentItem, item, view) {
      try {
        var hdr = item.QueryInterface(Ci.nsIMsgDBHdr);
      }
      catch(e) {
        return;
      }
      if (this.context.key == hdr.messageKey &&
          this.context.folder.URI == hdr.folder.URI) {
        this._resolver(this.context);
        // we don't need anymore the folderListener
        Cc['@mozilla.org/messenger/services/session;1'].getService(Ci.nsIMsgMailSession).RemoveFolderListener(this);
      }
    },
    OnItemRemoved: function(parentItem, item, view) {},
    OnItemPropertyChanged: function(item, property, oldValue, newValue) {},
    OnItemIntPropertyChanged: function(item, property, oldValue, newValue) {},
    OnItemBoolPropertyChanged: function(item, property, oldValue, newValue) {},
    OnItemUnicharPropertyChanged: function(item, property, oldValue, newValue){},
    OnItemPropertyFlagChanged: function(item, property, oldFlag, newFlag) {},
    OnItemEvent: function(folder, event) {}
  };

  aGlobal.ShowFirstBodyPart = ShowFirstBodyPart;
})(this);
