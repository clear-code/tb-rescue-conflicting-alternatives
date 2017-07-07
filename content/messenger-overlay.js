(function(aGlobal) {
  const Cc = Components.classes;
  const Ci = Components.interfaces;
  const Cu = Components.utils;
  const Cr = Components.results;
  const Prefs = Cc['@mozilla.org/preferences;1'].getService(Ci.nsIPrefBranch);

  var ShowFirstBodyPart = {
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

    editFS: function() {
      var msguri = gFolderDisplay.selectedMessageUris[0];
      var mms = messenger.messageServiceFromURI(msguri).QueryInterface(Ci.nsIMsgMessageService);
      var hdr = mms.messageURIToMsgHdr(msguri);
      var context = {
        hdr : hdr,
        folder : hdr.folder
      };
      mms.streamMessage(msguri, new ShowFirstBodyPartStreamMessageListener(context), null, null, false, null);
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

    postActions : function(aContext) {
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

  // streamMessage listener
  function ShowFirstBodyPartStreamMessageListener(aContext) {
    this.context = aContext;
  }
  ShowFirstBodyPartStreamMessageListener.prototype = {
    QueryInterface : function(iid)  {
      if (iid.equals(Ci.nsIStreamListener) ||
          iid.equals(Ci.nsISupports))
        return this;

      throw Components.results.NS_NOINTERFACE;
    },

    onStartRequest : function (aRequest, aContext) {
      this.context.text = '';
    },

    onStopRequest : function (aRequest, aContext, aStatusCode) {
      var isImap = this.context.folder.server.type == 'imap';
      var date = ShowFirstBodyPart.getOrigDate(this.context.text);

      var converter = Cc['@mozilla.org/intl/scriptableunicodeconverter'].createInstance(Ci.nsIScriptableUnicodeConverter);
      var text = this.context.text;
      if (this.context.hdr.Charset) {
        converter.charset = this.context.hdr.Charset;
        // hdr.Charset will not work with multipart messages, so we must try to extract the charset manually
      }
      else {
        try {
          let textCut = text.substring(text.indexOf('charset=')+8, text.indexOf('charset=')+35);
          let mailCharset = textCut.match(/[^\s]+/).toString();
          mailCharset = mailCharset.replace(/\"/g, '');
          mailCharset = mailCharset.replace(/\'/g, '');
          converter.charset = mailCharset;
        }
        catch(e) {
          converter.charset = 'UTF-8';
        }
      }
      try {
        text = converter.ConvertToUnicode(text);
      }
      catch(e) {}

      var data = ShowFirstBodyPart.cleanCRLF(text);
      try {
        data = converter.ConvertFromUnicode(data);
      }
      catch(e) {}

      // strips off some useless headers
      data = data.replace(/^From - .+\r\n/, '');
      data = data.replace(/X-Mozilla-Status.+\r\n/, '');
      data = data.replace(/X-Mozilla-Status2.+\r\n/, '');
      data = data.replace(/X-Mozilla-Keys.+\r\n/, '');

      if (Prefs.getBoolPref('extensions.hdrtoolslite.add_htl_header')) {
        let now = new Date;
        let line = 'X-ShowFirstBodyPart: applied - '+now.toString();
        line = line.replace(/\(.+\)/, '');
        line = line.substring(0, 75);
        if (data.indexOf('\nX-ShowFirstBodyPart: ') < 0)
          data = data.replace('\r\n\r\n','\r\n'+line+'\r\n\r\n');
        else
          data = data.replace(/\nX-ShowFirstBodyPart: .+\r\n/,'\n'+line+'\r\n');
      }

      if (isImap && Prefs.getBoolPref('extensions.hdrtoolslite.use_imap_fix')) {
        // Some IMAP provider (for ex. GMAIL) doesn't register changes in sorce if the main headers
        // are not different from an existing message. To work around this limit, the "Date" field is
        // modified, if necessary, adding a second to the time (or decreasing a second if second are 59)
        let newDate = date.replace(/(\d{2}):(\d{2}):(\d{2})/, function (str, p1, p2, p3) {
          var z = parseInt(p3) + 1;
          if (z > 59) z = 58;
          if (z < 10) z = '0'+z.toString();
          return p1+':'+p2+':'+z
        });
        data = data.replace(date, newDate);
      }

      // creates the temporary file, where the modified message body will be stored
      var tempFile = Cc['@mozilla.org/file/directory_service;1'].getService(Ci.nsIProperties).get('TmpD', Ci.nsIFile);
      tempFile.append('HT.eml');
      tempFile.createUnique(0, 0600);
      var foStream = Cc['@mozilla.org/network/file-output-stream;1'].createInstance(Ci.nsIFileOutputStream);
      foStream.init(tempFile, 2, 0x200, false); // open as "write only"
      foStream.write(data, data.length);
      foStream.close();

      var flags = this.context.hdr.flags;
      var keys = this.context.hdr.getStringProperty('keywords');

      this.context.list = Cc['@mozilla.org/array;1'].createInstance(Ci.nsIMutableArray);
      this.context.list.appendElement(this.context.hdr, false);

      // this is interesting: nsIMsgFolder.copyFileMessage seems to have a bug on Windows, when
      // the nsIFile has been already used by foStream (because of Windows lock system?), so we
      // must initialize another nsIFile object, pointing to the temporary file
      var fileSpec = Cc['@mozilla.org/file/local;1'].createInstance(Ci.nsILocalFile);
      fileSpec.initWithPath(tempFile.path);
      var fol = this.context.hdr.folder;
      var extService = Cc['@mozilla.org/uriloader/external-helper-app-service;1'].getService(Ci.nsPIExternalAppLauncher)
      extService.deleteTemporaryFileOnExit(fileSpec); // function's name says all!!!
      this.context.noTrash = !Prefs.getBoolPref('extensions.hdrtoolslite.putOriginalInTrash');
      let cs = Cc['@mozilla.org/messenger/messagecopyservice;1'].getService(Ci.nsIMsgCopyService);
      cs.CopyFileMessage(fileSpec, fol, null, false, flags, keys, new ShowFirstBodyPartCopyListener(this.context), msgWindow);
    },

    onDataAvailable : function (aRequest, aContext, aInputStream, aOffset, aCount) {
      var scriptStream = Cc['@mozilla.org/scriptableinputstream;1'].createInstance().QueryInterface(Ci.nsIScriptableInputStream);
      scriptStream.init(aInputStream);
      this.context.text += scriptStream.read(scriptStream.available());
    }
  };

  // copyFileMessage listener
  function ShowFirstBodyPartCopyListener(aContext) {
    this.context = aContext;
  }
  ShowFirstBodyPartCopyListener.prototype = {
    QueryInterface : function(iid) {
      if (iid.equals(Ci.nsIMsgCopyServiceListener) ||
          iid.equals(Ci, true, null, false))
        return this;

      throw Components.results.NS_NOINTERFACE;
    },
    SetMessageKey: function (key) {
      this.context.key = key;
      // at this point, the message is already stored in local folders, but not yet in remote folders,
      // so for remote folders we use a folderListener
      if (this.context.folder.server.type == 'imap' || this.context.folder.server.type == 'news') {
        let folderListener = new ShowFirstBodyPartFolderListener(this.context)
        this.context.URI = this.context.folder.URI;
        Cc['@mozilla.org/messenger/services/session;1'].getService(Ci.nsIMsgMailSession).AddFolderListener(folderListener, Ci.nsIFolderListener.all);
      }
      else {
        setTimeout(function() {
          ShowFirstBodyPart.postActions(this.context);
        }, 500);
      }
    }
  };

  // used just for remote folders
  function ShowFirstBodyPartFolderListener(aContext) {
    this.context = aContext;
  }
  ShowFirstBodyPartFolderListener.prototype = {
    OnItemAdded: function(parentItem, item, view) {
      try {
        var hdr = item.QueryInterface(Ci.nsIMsgDBHdr);
      }
      catch(e) {
        return;
      }
      if (this.key == hdr.messageKey && this.URI == hdr.folder.URI) {
        ShowFirstBodyPart.postActions(this.context);
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

})(this);
