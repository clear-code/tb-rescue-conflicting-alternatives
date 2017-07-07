var ShowFirstBodyPart = {

  // global variables
  folder : null,
  hdr : null,
  prefs : Components.classes['@mozilla.org/preferences-service;1'].getService(Components.interfaces.nsIPrefBranch),

  // parses headers to find the original Date header, not present in nsImsgDbHdr
  getOrigDate : function() {
    var dateOrig = '';
    var splitted = null;
    try {
      var str_message = ShowFirstBodyPart.listener.text;
      // This is the end of the headers
      var end = str_message.search(/\r?\n\r?\n/);
      if (str_message.indexOf('\nDate') > -1 && str_message.indexOf('\nDate')  < end)
        splitted =str_message.split('\nDate:');
      else if (str_message.indexOf('\ndate') > -1 && str_message.indexOf('\ndate')  < end)
        splitted =str_message.split('\ndate:');
      if (splitted) {
        dateOrig = splitted[1].split('\n')[0];
        dateOrig = dateOrig.replace(/ +$/, '');
        dateOrig = dateOrig.replace(/^ +/, '');
      }
    }
    catch(e) {}
    return dateOrig;
  },

  // start editing full source
  editFS: function() {
    var msguri = gFolderDisplay.selectedMessageUris[0];
    var mms = messenger.messageServiceFromURI(msguri)
      .QueryInterface(Components.interfaces.nsIMsgMessageService);
    this.hdr = mms.messageURIToMsgHdr(msguri);
    this.folder = this.hdr.folder;
    mms.streamMessage(msguri, this.listener, null, null, false, null);
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

  // streamMessage listener
  listener : {
    QueryInterface : function(iid)  {
                  if (iid.equals(Components.interfaces.nsIStreamListener) ||
                      iid.equals(Components.interfaces.nsISupports))
                   return this;

                  throw Components.results.NS_NOINTERFACE;
                  return 0;
          },

          onStartRequest : function (aRequest, aContext) {
      this.text = '';
    },

    onStopRequest : function (aRequest, aContext, aStatusCode) {
      var isImap = (ShowFirstBodyPart.folder.server.type == 'imap') ? true : false;
      var date = ShowFirstBodyPart.getOrigDate();
      var originalSub = ShowFirstBodyPart.hdr.mime2DecodedSubject;

      // we're editing full source
      var textObj = {};
      var converter = Components.classes['@mozilla.org/intl/scriptableunicodeconverter']
        .createInstance(Components.interfaces.nsIScriptableUnicodeConverter);
      var text = this.text;
      if (ShowFirstBodyPart.hdr.Charset) {
        converter.charset = ShowFirstBodyPart.hdr.Charset;
      // hdr.Charset will not work with multipart messages, so we must try to extract the charset manually
      }
      else {
        try {
          var textCut = text.substring(text.indexOf('charset=')+8, text.indexOf('charset=')+35);
          var mailCharset = textCut.match(/[^\s]+/).toString();
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
      var dateIsChanged = false;
      var action = 'bodyChanged';

      // strips off some useless headers
      data = data.replace(/^From - .+\r\n/, '');
      data = data.replace(/X-Mozilla-Status.+\r\n/, '');
      data = data.replace(/X-Mozilla-Status2.+\r\n/, '');
      data = data.replace(/X-Mozilla-Keys.+\r\n/, '');

      if (ShowFirstBodyPart.prefs.getBoolPref('extensions.hdrtoolslite.add_htl_header')) {
        var now = new Date;
        var HTLhead = 'X-HeaderToolsLite: '+action+' - '+now.toString();
        HTLhead = HTLhead.replace(/\(.+\)/, '');
        HTLhead = HTLhead.substring(0,75);
        if (data.indexOf('\nX-HeaderToolsLite: ') <0)
          data = data.replace('\r\n\r\n','\r\n'+HTLhead+'\r\n\r\n');
        else
          data = data.replace(/\nX-HeaderToolsLite: .+\r\n/,'\n'+HTLhead+'\r\n');
       }

       if (! dateIsChanged && isImap && ShowFirstBodyPart.prefs.getBoolPref('extensions.hdrtoolslite.use_imap_fix')) {
         // Some IMAP provider (for ex. GMAIL) doesn't register changes in sorce if the main headers
         // are not different from an existing message. To work around this limit, the "Date" field is
         // modified, if necessary, adding a second to the time (or decreasing a second if second are 59)
         var newDate = date.replace(/(\d{2}):(\d{2}):(\d{2})/, function (str, p1, p2, p3) {
           var z = parseInt(p3)+1;
           if (z > 59) z = 58;
           if (z < 10) z = '0'+z.toString();
           return p1+':'+p2+':'+z
         });
         data = data.replace(date,newDate);
      }

      // creates the temporary file, where the modified message body will be stored
      var tempFile = Components.classes['@mozilla.org/file/directory_service;1'].
        getService(Components.interfaces.nsIProperties).
        get('TmpD', Components.interfaces.nsIFile);
      tempFile.append('HT.eml');
      tempFile.createUnique(0,0600);
      var foStream = Components.classes['@mozilla.org/network/file-output-stream;1']
        .createInstance(Components.interfaces.nsIFileOutputStream);
      foStream.init(tempFile, 2, 0x200, false); // open as "write only"
      foStream.write(data,data.length);
      foStream.close();

      var flags =  ShowFirstBodyPart.hdr.flags;
      var keys =  ShowFirstBodyPart.hdr.getStringProperty('keywords');

      ShowFirstBodyPart.list = Components.classes['@mozilla.org/array;1'].createInstance(Components.interfaces.nsIMutableArray);
      ShowFirstBodyPart.list.appendElement(ShowFirstBodyPart.hdr, false);

      // this is interesting: nsIMsgFolder.copyFileMessage seems to have a bug on Windows, when
      // the nsIFile has been already used by foStream (because of Windows lock system?), so we
      // must initialize another nsIFile object, pointing to the temporary file
      var fileSpec = Components.classes['@mozilla.org/file/local;1']
        .createInstance(Components.interfaces.nsILocalFile);
      fileSpec.initWithPath(tempFile.path);
      var fol = ShowFirstBodyPart.hdr.folder;
      var extService = Components.classes['@mozilla.org/uriloader/external-helper-app-service;1']
        .getService(Components.interfaces.nsPIExternalAppLauncher)
      extService.deleteTemporaryFileOnExit(fileSpec); // function's name says all!!!
      ShowFirstBodyPart.noTrash = ! (ShowFirstBodyPart.prefs.getBoolPref('extensions.hdrtoolslite.putOriginalInTrash'))
      // Moved in copyListener.onStopCopy
      // ShowFirstBodyPart.folder.deleteMessages(ShowFirstBodyPart.list,null,noTrash,true,null,false);
      var cs = Components.classes['@mozilla.org/messenger/messagecopyservice;1']
                          .getService(Components.interfaces.nsIMsgCopyService);
      cs.CopyFileMessage(fileSpec, fol, null, false, flags, keys, ShowFirstBodyPart.copyListener, msgWindow);
    },

    onDataAvailable : function (aRequest, aContext, aInputStream, aOffset, aCount) {
      var scriptStream = Components.classes['@mozilla.org/scriptableinputstream;1'].
            createInstance().QueryInterface(Components.interfaces.nsIScriptableInputStream);
      scriptStream.init(aInputStream);
      this.text += scriptStream.read(scriptStream.available());
    }
  },

  // copyFileMessage listener
  copyListener : {
    QueryInterface : function(iid) {
      if (iid.equals(Components.interfaces.nsIMsgCopyServiceListener) ||
      iid.equals(Components.interfaces.nsISupports))
      return this;

      throw Components.results.NS_NOINTERFACE;
      return 0;
    },
    GetMessageId: function (messageId) {},
    OnProgress: function (progress, progressMax) {},
    OnStartCopy: function () {},
    OnStopCopy: function (status) {
      if (status == 0) // copy done
        ShowFirstBodyPart.folder.deleteMessages(ShowFirstBodyPart.list,null,ShowFirstBodyPart.noTrash,true,null,false);
    },
    SetMessageKey: function (key) {
      // at this point, the message is already stored in local folders, but not yet in remote folders,
      // so for remote folders we use a folderListener
      if (ShowFirstBodyPart.folder.server.type == 'imap' || ShowFirstBodyPart.folder.server.type == 'news') {
        Components.classes['@mozilla.org/messenger/services/session;1']
                  .getService(Components.interfaces.nsIMsgMailSession)
                  .AddFolderListener(ShowFirstBodyPart.folderListener, Components.interfaces.nsIFolderListener.all);
        ShowFirstBodyPart.folderListener.key = key;
        ShowFirstBodyPart.folderListener.URI = ShowFirstBodyPart.folder.URI;
      }
      else
        setTimeout(function() {ShowFirstBodyPart.postActions(key);}, 500);
    }
  },

  postActions : function(key) {
    gDBView.selectMsgByKey(key); // select message with modified headers/source
    var hdr = ShowFirstBodyPart.folder.GetMessageHeader(key);
    if (hdr.flags & 2)
      ShowFirstBodyPart.folder.addMessageDispositionState(hdr,0); //set replied if necessary
          if (hdr.flags & 4096)
      ShowFirstBodyPart.folder.addMessageDispositionState(hdr,1); //set fowarded if necessary
  },

  // used just for remote folders
  folderListener  : {
    OnItemAdded: function(parentItem, item, view) {
      try {
        var hdr = item.QueryInterface(Components.interfaces.nsIMsgDBHdr);
      }
      catch(e) {
                 return;
      }
      if (this.key == hdr.messageKey && this.URI == hdr.folder.URI) {
        ShowFirstBodyPart.postActions(this.key);
        // we don't need anymore the folderListener
         Components.classes['@mozilla.org/messenger/services/session;1']
                      .getService(Components.interfaces.nsIMsgMailSession)
                      .RemoveFolderListener(ShowFirstBodyPart.folderListener);
      }
    },
    OnItemRemoved: function(parentItem, item, view) {},
    OnItemPropertyChanged: function(item, property, oldValue, newValue) {},
    OnItemIntPropertyChanged: function(item, property, oldValue, newValue) {},
    OnItemBoolPropertyChanged: function(item, property, oldValue, newValue) {},
    OnItemUnicharPropertyChanged: function(item, property, oldValue, newValue){},
    OnItemPropertyFlagChanged: function(item, property, oldFlag, newFlag) {},
    OnItemEvent: function(folder, event) {}
  }
};



