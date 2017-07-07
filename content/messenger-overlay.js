var ShowFirstBodyPart = {
	
	// global variables
	folder : null,	
	hdr : null,
	prefs : Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch),
	bundle : Components.classes["@mozilla.org/intl/stringbundle;1"].getService(Components.interfaces.nsIStringBundleService).createBundle("chrome://hdrtoolslite/locale/hdrtools.properties"),

	// called loading dialog for changing headers details
	initDialog : function() {
		// window.arguments[0] is an object with date,subject,author and recipients as strings
		var date1 = window.arguments[0].date.substring(0,3);
		for (var i=1;i<8;i++) {
			if (document.getElementById("date3").menupopup.childNodes[i].label == date1) {
				document.getElementById("date3").selectedIndex = i;	
				date1 = null;
				break;
			}
		}
		if (! date1)
			document.getElementById("dateBox").value = window.arguments[0].date.substring(5);
		else 			
			document.getElementById("dateBox").value = window.arguments[0].date;
		document.getElementById("subBox").value = window.arguments[0].subject;
		document.getElementById("authBox").value = window.arguments[0].author;
		document.getElementById("recBox").value = window.arguments[0].recipients;
		document.getElementById("replytoBox").value = window.arguments[0].replyto;
		document.getElementById("midBox").value = window.arguments[0].mid;
		document.getElementById("refBox").value = window.arguments[0].ref;
		window.sizeToContent();
	},

	// called closing dialog for changing headers details
	exitDialog : function(cancel) {
		window.arguments[0].cancel = cancel;
		if (cancel)  // user clicked on "Cancel" button
			return true;

		if (document.getElementById("date3").selectedIndex > 0) 
			var dateValue = document.getElementById("date3").selectedItem.label+", "+document.getElementById("dateBox").value;
		else 	
			var dateValue = document.getElementById("dateBox").value;

		/*
		if (! dateValue.match(/^.{3}\,/)) {
			alert(ShowFirstBodyPart.bundle.GetStringFromName("wrongDate"));
			return false;
		}*/
		window.arguments[0].date = dateValue;
		window.arguments[0].subject = document.getElementById("subBox").value;
		window.arguments[0].author = document.getElementById("authBox").value;
		window.arguments[0].recipients = document.getElementById("recBox").value;
		window.arguments[0].replyto = document.getElementById("replytoBox").value;
		window.arguments[0].mid = document.getElementById("midBox").value;
		window.arguments[0].ref = document.getElementById("refBox").value;
		return true;
	},

	// called loading dialog for editing full source, that is in window.arguments[0].value
	initDialog2 : function() {
		document.getElementById("editFSarea").focus();
		var limit = ShowFirstBodyPart.prefs.getIntPref("extensions.hdrtoolslite.fullsource_maxchars");
		ShowFirstBodyPart.full = window.arguments[0].value.length;
		if (limit > -1 &&  ShowFirstBodyPart.full > limit) {
			var text =  window.arguments[0].value.substring(0,limit);
			document.getElementById("FS_button").removeAttribute("collapsed");
			var percent = parseInt((limit/ShowFirstBodyPart.full)*100);
		}
		else {
			var text =  window.arguments[0].value;
			var percent = 100;
		}
		document.getElementById("sourcePercent").value = document.getElementById("sourcePercent").value.replace("§", percent);
		// dialog will hang with too big vaue for textbox on slow machines
		document.getElementById("editFSarea").setAttribute("limit", limit);
		document.getElementById("charsetBox").value = window.arguments[0].charset;
		setTimeout(function() {
			document.getElementById("editFSarea").value = text;
			// move the cursor at the beginning of the text
			document.getElementById("editFSarea").setSelectionRange(0,0);
			window.sizeToContent();
		}, 300);
	},

	showFullSource : function() {
		if (confirm(ShowFirstBodyPart.bundle.GetStringFromName("fsBigMessage"))) {
			document.getElementById("editFSarea").setAttribute("limit", "-1");
			document.getElementById("editFSarea").value = "";
			document.getElementById("editFSarea").value = window.arguments[0].value;
			document.getElementById("FS_button").collapsed = true;
			document.getElementById("sourcePercent").value = document.getElementById("sourcePercent").value.replace(/\d+\%/, "100%");
		}
	},

	// called closing dialog for editing full source
	exitDialog2 : function(cancel) {
		window.arguments[0].cancel = cancel;
		if (! cancel) {
			var limit = document.getElementById("editFSarea").getAttribute("limit");
			if (limit > -1) {
				var fullSource = window.arguments[0].value.substring(limit);
				fullSource =  document.getElementById("editFSarea").value + fullSource;
			}
			else
				var fullSource = document.getElementById("editFSarea").value;
			window.arguments[0].value = fullSource;
			window.arguments[0].charset = document.getElementById("charsetBox").value;
		}
	},

	// parses headers to find the original Date header, not present in nsImsgDbHdr
	getOrigDate : function() {
		var dateOrig = "";
		var splitted = null;
		try {
			var str_message = ShowFirstBodyPart.listener.text;
			// This is the end of the headers
			var end = str_message.search(/\r?\n\r?\n/);
			if (str_message.indexOf("\nDate") > -1 && str_message.indexOf("\nDate")  < end) 
				splitted =str_message.split("\nDate:");
			else if (str_message.indexOf("\ndate") > -1 && str_message.indexOf("\ndate")  < end) 
				splitted =str_message.split("\ndate:");
			if (splitted) {
				dateOrig = splitted[1].split("\n")[0];
				dateOrig = dateOrig.replace(/ +$/,"");
				dateOrig = dateOrig.replace(/^ +/,"");
			}
		}
		catch(e) {}
		return dateOrig;
	},
	
	// start changing headers details
	edit: function() {
		var msguri = gFolderDisplay.selectedMessageUris[0];
		var mms = messenger.messageServiceFromURI(msguri)
			.QueryInterface(Components.interfaces.nsIMsgMessageService);
		ShowFirstBodyPart.hdr = mms.messageURIToMsgHdr(msguri);
		ShowFirstBodyPart.folder = ShowFirstBodyPart.hdr.folder;
		ShowFirstBodyPart.listener.fullSource = false;
		mms.streamMessage(msguri, ShowFirstBodyPart.listener, null, null, false, null);	
	},

	// start editing full source
	editFS: function() {
		if (ShowFirstBodyPart.prefs.getBoolPref("extensions.hdrtoolslite.editFullSourceWarning")) {
			var promptService = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
                              .getService(Components.interfaces.nsIPromptService);
			var check = {value: false}; 
			promptService.alertCheck(null,"HeaderToolsLite", ShowFirstBodyPart.bundle.GetStringFromName("fsWarning"),ShowFirstBodyPart.bundle.GetStringFromName("dontShowAgain"), check);
			ShowFirstBodyPart.prefs.setBoolPref("extensions.hdrtoolslite.editFullSourceWarning", ! check.value);
		}
		var msguri = gFolderDisplay.selectedMessageUris[0];
		var mms = messenger.messageServiceFromURI(msguri)
			.QueryInterface(Components.interfaces.nsIMsgMessageService);
		ShowFirstBodyPart.hdr = mms.messageURIToMsgHdr(msguri);
		ShowFirstBodyPart.folder = ShowFirstBodyPart.hdr.folder;
		ShowFirstBodyPart.listener.fullSource = true;
		mms.streamMessage(msguri, ShowFirstBodyPart.listener, null, null, false, null);			
	},

	cleanCRLF : function(data) {
		/* This function forces all newline as CRLF; this is useful for some reasons
		1) this will make the message RFC2822 compliant
		2) this will fix some problems with IMAP servers that don't accept mixed newlines
		3) this will make easier to use regexps
		*/
		var newData = data.replace(/\r/g, "");
		newData = newData.replace(/\n/g, "\r\n");
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
			ShowFirstBodyPart.listener.text = "";			
		},
            
        	onStopRequest : function (aRequest, aContext, aStatusCode) {
			
			var isImap = (ShowFirstBodyPart.folder.server.type == "imap") ? true : false;
			var date = ShowFirstBodyPart.getOrigDate();
			var originalSub = ShowFirstBodyPart.hdr.mime2DecodedSubject;
				
			if (ShowFirstBodyPart.listener.fullSource) {
				// we're editing full source
				var textObj = {};
				var converter = Components.classes["@mozilla.org/intl/scriptableunicodeconverter"]
					.createInstance(Components.interfaces.nsIScriptableUnicodeConverter); 
				var text = ShowFirstBodyPart.listener.text;
				if (ShowFirstBodyPart.hdr.Charset)
					converter.charset = ShowFirstBodyPart.hdr.Charset;
				// hdr.Charset will not work with multipart messages, so we must try to extract the charset manually
				else {
					try {
						var textCut = text.substring(text.indexOf("charset=")+8, text.indexOf("charset=")+35);
						var mailCharset = textCut.match(/[^\s]+/).toString();
						mailCharset = mailCharset.replace(/\"/g, "");
						mailCharset = mailCharset.replace(/\'/g, "");
						converter.charset = mailCharset;
					}
					catch(e) {
						converter.charset = "UTF-8";
					}
				}
				try {
					text = converter.ConvertToUnicode(text);
				}
				catch(e) {}
			
				textObj.value = text;
				textObj.charset = converter.charset;
				window.openDialog('chrome://hdrtoolslite/content/cnghdrs2.xul',"","chrome,modal,centerscreen,resizable",textObj);
				if (textObj.cancel) { // user clicked on "Cancel" button
					ShowFirstBodyPart.hdr = null;
					ShowFirstBodyPart.folder = null;
					return;
				}
				var data = ShowFirstBodyPart.cleanCRLF(textObj.value);
				try {
					converter.charset = textObj.charset;
					data = converter.ConvertFromUnicode(data);
				}
				catch(e) {}
				var dateIsChanged = false;
				var action = "bodyChanged";	
			}
			else {
				// we're just changing headers details
				var newHdr = {};
				newHdr.author = ShowFirstBodyPart.hdr.mime2DecodedAuthor;
				newHdr.recipients = ShowFirstBodyPart.hdr.mime2DecodedRecipients;
				if (ShowFirstBodyPart.hdr.flags & 0x0010) 
					// in replies the subject returned by mime2DecodedSubject has no initial "Re:"
					originalSub ="Re: "+ originalSub;
				newHdr.subject = originalSub;
				newHdr.date = date;
				newHdr.replyto = ShowFirstBodyPart.hdr.getStringProperty("replyTo");
				if (ShowFirstBodyPart.hdr.messageId)
					newHdr.mid = "<"+ShowFirstBodyPart.hdr.messageId+">";
				newHdr.ref = "";
				var refs = ShowFirstBodyPart.hdr.numReferences;
				if (refs > 0)
					newHdr.ref = "<"+ShowFirstBodyPart.hdr.getStringReference(0)+">";
				for (var i=1;i<refs;i++)
					newHdr.ref = newHdr.ref + " <" + ShowFirstBodyPart.hdr.getStringReference(i)+">";

				window.openDialog('chrome://hdrtoolslite/content/cnghdrs.xul',"","chrome,modal,centerscreen,resizable ",newHdr);

				if (newHdr.cancel) 
					return;
			
				// encodes the headers in UTF-8. I couldn't use message charset, because sometimes it's null
				var mimeEncoder = Components.classes["@mozilla.org/messenger/mimeconverter;1"]
					.getService(Components.interfaces.nsIMimeConverter);
				var newSubEnc = mimeEncoder.encodeMimePartIIStr_UTF8(newHdr.subject, false, "UTF-8", 0, 72);
				var newAuthEnc = mimeEncoder.encodeMimePartIIStr_UTF8(newHdr.author, true, "UTF-8", 0, 72);		
				var newRecEnc = mimeEncoder.encodeMimePartIIStr_UTF8(newHdr.recipients, true, "UTF-8", 0, 72);
				if (newHdr.replyto)
					var newReplytoEnc = mimeEncoder.encodeMimePartIIStr_UTF8(newHdr.replyto, true, "UTF-8", 0, 72);
				else
					var newReplytoEnc = null;
			
				var data = ShowFirstBodyPart.cleanCRLF(ShowFirstBodyPart.listener.text);
				var endHeaders = data.search(/\r\n\r\n/);
				var headers = data.substring(0,endHeaders);

				// unfold headers, if necessary
				while(headers.match(/\r\nSubject: .*\r\n\s+/))
					headers = headers.replace(/(\r\nSubject: .*)(\r\n\s+)/, "$1 ");
				while(headers.match(/\r\nFrom: .*\r\n\s+/))
					headers = headers.replace(/(\r\nFrom: .*)(\r\n\s+)/, "$1 ");
				while(headers.match(/\r\nTo: .*\r\n\s+/))
					headers = headers.replace(/(\r\nTo: .*)(\r\n\s+)/, "$1 ");
				
				// This will be removed after the if-else_if-else series, it will make easier to test headers
				headers = "\n"+headers+"\r\n";
				
				// check also lowercase headers, used for example by SOGO
				if (headers.indexOf("\nSubject:") > -1)
					headers = headers.replace(/\nSubject: *.*\r\n/, "\nSubject: "+ newSubEnc+"\r\n");
				else if (headers.indexOf("\nsubject:") > -1)
					headers = headers.replace(/\nsubject: *.*\r\n/, "\nsubject: "+ newSubEnc+"\r\n");
				else // header missing
					headers = headers+("Subject: "+newSubEnc+"\r\n");
				if (headers.indexOf("\nFrom:") > -1)
					headers = headers.replace(/\nFrom: *.*\r\n/, "\nFrom: "+ newAuthEnc+"\r\n");
				else if (headers.indexOf("\nfrom:") > -1)
					headers = headers.replace(/\nfrom: *.*\r\n/, "\nfrom: "+ newAuthEnc+"\r\n");
				else // header missing
					headers = headers+("From: "+newAuthEnc+"\r\n");
				if (headers.indexOf("\nTo:") > -1)
					headers = headers.replace(/\nTo: *.*\r\n/, "\nTo: "+ newRecEnc+"\r\n");
				else if (headers.indexOf("\nto:") > -1)
					headers = headers.replace(/\nto: *.*\r\n/, "\nto: "+ newRecEnc+"\r\n");
				else // header missing
					headers = headers+("To: "+newRecEnc+"\r\n");
				if (headers.indexOf("\nDate:") > -1)
					headers = headers.replace(/\nDate: *.*\r\n/, "\nDate: "+newHdr.date+"\r\n");
				else if (headers.indexOf("\ndate:") > -1)
					headers = headers.replace(/\ndate: *.*\r\n/, "\ndate: "+ newHdr.date+"\r\n");
				else // header missing
					headers = headers+("Date: "+newHdr.date+"\r\n");
				if (headers.indexOf("\nMessage-ID:") > -1)
					headers = headers.replace(/\nMessage-ID: *.*\r\n/, "\nMessage-ID: "+newHdr.mid+"\r\n");
				else if (newHdr.mid) { // header missing 
					var newMid = (newHdr.mid.substring(0,1) == "<") ? newHdr.mid : "<"+newHdr.mid+">";
					headers = headers+("Message-ID: "+newMid+"\r\n");
				}
				if (headers.indexOf("\nReferences:") > -1)
					headers = headers.replace(/\nReferences: *.*\r\n/, "\nReferences: "+newHdr.ref+"\r\n");
				else if (newHdr.ref) // header missing
					headers = headers+("References: "+newHdr.ref+"\r\n");
				if (newReplytoEnc) {
					if (headers.indexOf("Reply-To:") > -1)
						headers = headers.replace(/\nReply\-To: *.*\r\n/, "\nReply-To: "+newHdr.replyto+"\r\n");
					if (headers.indexOf("reply-to:") > -1)
						headers = headers.replace(/\nreply\-to: *.*\r\n/, "\nreply-to: "+newHdr.replyto+"\r\n");
					else // header missing
						headers = headers+("Reply-To: "+newHdr.replyto+"\r\n");
				} 
				
				// strips off characters added in line 292
				headers = headers.substring(1,headers.length-2);
				data = headers + data.substring(endHeaders);
				var action = "headerChanged";
			}

			// strips off some useless headers
			data = data.replace(/^From - .+\r\n/, "");
			data = data.replace(/X-Mozilla-Status.+\r\n/, "");
			data = data.replace(/X-Mozilla-Status2.+\r\n/, "");
			data = data.replace(/X-Mozilla-Keys.+\r\n/, "");
				
			if (ShowFirstBodyPart.prefs.getBoolPref("extensions.hdrtoolslite.add_htl_header")) {
				var now = new Date;
				var HTLhead = "X-HeaderToolsLite: "+action+" - "+now.toString();
				HTLhead = HTLhead.replace(/\(.+\)/, "");
				HTLhead = HTLhead.substring(0,75);
				if (data.indexOf("\nX-HeaderToolsLite: ") <0) 
					data = data.replace("\r\n\r\n","\r\n"+HTLhead+"\r\n\r\n");
				else	
					data = data.replace(/\nX-HeaderToolsLite: .+\r\n/,"\n"+HTLhead+"\r\n");
			}
						
			if (! dateIsChanged && isImap && ShowFirstBodyPart.prefs.getBoolPref("extensions.hdrtoolslite.use_imap_fix")) {
				// Some IMAP provider (for ex. GMAIL) doesn't register changes in sorce if the main headers
				// are not different from an existing message. To work around this limit, the "Date" field is 
				// modified, if necessary, adding a second to the time (or decreasing a second if second are 59)
				var newDate = date.replace(/(\d{2}):(\d{2}):(\d{2})/, function (str, p1, p2, p3) {
					var z = parseInt(p3)+1; 
					if (z > 59) z = 58;
					if (z < 10) z = "0"+z.toString(); 
					return p1+":"+p2+":"+z});
				data = data.replace(date,newDate);
			}

			// creates the temporary file, where the modified message body will be stored
			var tempFile = Components.classes["@mozilla.org/file/directory_service;1"].  
				getService(Components.interfaces.nsIProperties).  
				get("TmpD", Components.interfaces.nsIFile);  
			tempFile.append("HT.eml");
			tempFile.createUnique(0,0600);
			var foStream = Components.classes["@mozilla.org/network/file-output-stream;1"]
				.createInstance(Components.interfaces.nsIFileOutputStream);
			foStream.init(tempFile, 2, 0x200, false); // open as "write only"
			foStream.write(data,data.length);
			foStream.close();
					
			var flags =  ShowFirstBodyPart.hdr.flags;
			var keys =  ShowFirstBodyPart.hdr.getStringProperty("keywords");

			ShowFirstBodyPart.list = Components.classes["@mozilla.org/array;1"].createInstance(Components.interfaces.nsIMutableArray);
			ShowFirstBodyPart.list.appendElement(ShowFirstBodyPart.hdr, false);
	
			// this is interesting: nsIMsgFolder.copyFileMessage seems to have a bug on Windows, when
			// the nsIFile has been already used by foStream (because of Windows lock system?), so we	
			// must initialize another nsIFile object, pointing to the temporary file
			var fileSpec = Components.classes["@mozilla.org/file/local;1"]
				.createInstance(Components.interfaces.nsILocalFile);
			fileSpec.initWithPath(tempFile.path);
			var fol = ShowFirstBodyPart.hdr.folder;
			var extService = Components.classes['@mozilla.org/uriloader/external-helper-app-service;1']
				.getService(Components.interfaces.nsPIExternalAppLauncher)
			extService.deleteTemporaryFileOnExit(fileSpec); // function's name says all!!!
			ShowFirstBodyPart.noTrash = ! (ShowFirstBodyPart.prefs.getBoolPref("extensions.hdrtoolslite.putOriginalInTrash"))
			// Moved in copyListener.onStopCopy
			// ShowFirstBodyPart.folder.deleteMessages(ShowFirstBodyPart.list,null,noTrash,true,null,false);
			var cs = Components.classes["@mozilla.org/messenger/messagecopyservice;1"]
                     		 .getService(Components.interfaces.nsIMsgCopyService);
			cs.CopyFileMessage(fileSpec, fol, null, false, flags, keys, ShowFirstBodyPart.copyListener, msgWindow);		
		},
	
         	onDataAvailable : function (aRequest, aContext, aInputStream, aOffset, aCount) {
				var scriptStream = Components.classes["@mozilla.org/scriptableinputstream;1"].
            	createInstance().QueryInterface(Components.interfaces.nsIScriptableInputStream);
				scriptStream.init(aInputStream);
				ShowFirstBodyPart.listener.text+=scriptStream.read(scriptStream.available());
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
			if (ShowFirstBodyPart.folder.server.type == "imap" || ShowFirstBodyPart.folder.server.type == "news") {
				Components.classes["@mozilla.org/messenger/services/session;1"]
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
			if (ShowFirstBodyPart.folderListener.key == hdr.messageKey && ShowFirstBodyPart.folderListener.URI == hdr.folder.URI) {
				ShowFirstBodyPart.postActions(ShowFirstBodyPart.folderListener.key);
				// we don't need anymore the folderListener
				 Components.classes["@mozilla.org/messenger/services/session;1"]
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
	},
	
	init : function() {
		var shortcut1, shortcut2 = null;
		try {
			shortcut1 = ShowFirstBodyPart.prefs.getCharPref("extensions.hdrtoolslite.edit_shortcut");
			shortcut2 = ShowFirstBodyPart.prefs.getCharPref("extensions.hdrtoolslite.editFS_shortcut");
		}
		catch(e) {}
		if (shortcut1) {
			var key1 = document.createElement("key");
			key1.setAttribute("key", shortcut1);
			key1.setAttribute("modifiers", "control");
			key1.setAttribute("id", "headerToolsLightkey1");
			key1.setAttribute("command", "headerToolsLightedit");
			document.getElementById("headerToolsLightkeyset").appendChild(key1);
			document.getElementById("headerToolsLightModify1").setAttribute("key", "headerToolsLightkey1");
		}
		if (shortcut2) {
			var key2 = document.createElement("key");
			key2.setAttribute("key", shortcut2);
			key2.setAttribute("modifiers", "control");
			key2.setAttribute("id", "headerToolsLightkey2");
			key2.setAttribute("command", "headerToolsLighteditFS");
			document.getElementById("headerToolsLightkeyset").appendChild(key2);
			document.getElementById("headerToolsLightModify2").setAttribute("key", "headerToolsLightkey2");
		}    
	}
};



