sap.ui.define(
  [
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/Fragment",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator"
  ],
  function (BaseController, Fragment, Filter, FilterOperator) {
    "use strict";

    return BaseController.extend("safetystockdistributioncenter.controller.App", {
      onInit: function () {
        this.oAppModel = this.getOwnerComponent().getModel("appModel");
      },
      //On clicking on Store ID Value help 
      onStoreIdVHReq: function (oEvent) {
        var sMultiInputId = oEvent.getParameter("id");
        if (this.getView()) {
          Fragment.load({
            name: "safetystockdistributioncenter.fragment.Site",
            controller: this,
            id: "storeValueHelp"
          }).then(function (oDialog) {
            this._oDialogPopup = oDialog;
            this.getView().addDependent(oDialog);
            if (sMultiInputId.includes('createSite')) {
              oDialog.setKey('Store')
              this.oAppModel.setProperty("/enableSiteSupportRanges", false);
            }
            else {
              oDialog.setKey('site')
              this.oAppModel.setProperty("/enableSiteSupportRanges", true);
              oDialog.setRangeKeyFields([{
                label: this.i18nModel.getProperty("dc"),
                key: "site"
              }]);
            }
            this.setVHSettingsStoreID(oDialog, sMultiInputId);
            oDialog.setTokens(this._oMultiInputSite.getTokens());
            oDialog.open();
          }.bind(this))
        }
      },
      //Binding the values to the Store ID value help
      setVHSettingsStoreID: function (oDialog, sMultiInputId) {
        // basic search 
        if (oDialog.getFilterBar()) {
          var oSearchField = new sap.m.SearchField({
            showSearchButton: true,
            value: "{appModel>/enteredStoreID}",
            change: this.onStoreIDFilterBarSearch.bind(this),
            submit: this.onStoreIDFilterBarSearch.bind(this)
          })
          oDialog.getFilterBar().setBasicSearch(oSearchField);
        }
        oDialog.getTable().setModel(this.oDataModel);
        oDialog.getTableAsync().then(function (oTable) {
          this._oTableVH = oTable;
          var that = this;
          var oColModel;
          if (sMultiInputId.includes('createSite')) {
            var oColModel = new sap.ui.model.json.JSONModel({
              "cols": [{
                "label": this.i18nModel.getProperty("dc"),
                "template": "site",
                "width": "4rem"
              },
              {
                "label": this.i18nModel.getProperty("dcdesc"),
                "template": "siteDesc",
                "width": "15rem"
              }
              ]
            });
          } else {
            oColModel = new sap.ui.model.json.JSONModel({
              "cols": [{
                "label": this.i18nModel.getProperty("dc"),
                "template": "site",
                "width": "4rem"
              },
              {
                "label": this.i18nModel.getProperty("dcdesc"),
                "template": "siteDesc",
                "width": "15rem"
              }
              ]
            });
          }

          if (sMultiInputId.includes('createSite')) {
            oTable.setSelectionMode('Single');
            oTable.attachRowSelectionChange(
              function () {
                oDialog.setTokens([]);
                var iIndex = that._oTableVH.getSelectedIndex();
                if (iIndex != -1) {
                  var sText = that._oTableVH.getContextByIndex(iIndex).getObject().site;
                  that._oTableVH.getParent().getParent().getParent().getParent().setTokens([new sap.m.Token({
                    key: sText, text: sText
                  })])
                }
              }
            )
          }
          oTable.setModel(oColModel, "columns");
          if (oTable.bindRows) {
            if (sMultiInputId.includes('createSite')) {
              oTable.bindAggregation("rows", "/SiteSet");
            } else {
              oTable.bindAggregation("rows", "/SiteSet");
            }
          }
          oDialog.update();
        }.bind(this));

      },
      //Search functionality inside the Store ID value help
      onStoreIDFilterBarSearch: function (oEvent) {
        var sViewId;
        if (oEvent != undefined) {
          sViewId = oEvent.getSource().getParent().getParent().getParent().getParent().getParent().getParent().getParent().sId.split('-')[4];
        } else {
          sViewId = this.sViewId;
        }
        var oFinalFilter = [];
        if (this.oAppModel.getProperty("/enteredStoreID").length > 0) {
          if (sViewId === 'Home') {
            oFinalFilter.push(new Filter("site", FilterOperator.EQ, this.oAppModel.getProperty("/enteredStoreID")));
          } else {
            oFinalFilter.push(new Filter("site", FilterOperator.EQ, this.oAppModel.getProperty("/enteredStoreID")));
          }
        }
        if (sViewId === 'Home') {
          this._oTableVH.bindRows({
            path: "/SiteSet",
            filters: oFinalFilter
          })
        } else {
          this._oTableVH.bindRows({
            path: "/SiteSet",
            filters: oFinalFilter
          })
        }
      },
      // event triggers on click of Cancel button in Store ID value help
      onSiteValueHelpCancelPress: function (oEvent) {
        var sViewId = oEvent.getSource().getParent().sId.split('-')[4];
        this.sViewId = sViewId;
        this.oAppModel.setProperty("/enteredStoreID", "");
        this.onStoreIDFilterBarSearch();
        this._oDialogPopup.close();
      },
      // destroys fragment control
      onStoreAfterClose: function () {
        this._oDialogPopup.destroy();
      },
      // event triggers on click of OK button in Store ID value help
      onSiteCodeValueHelpOkPress: function (oEvent) {
        var aTokens = oEvent.getParameter("tokens");
        for (var i = 0; i < aTokens.length; i++) {
          if (aTokens[i].data('range') !== null) {
            aTokens[i].data('range').keyField = "site"
            if (aTokens[i].data('range').exclude) {
              aTokens[i].data('range').operation = "NE"
            }
          } else {
            aTokens[i].setText(aTokens[i].getProperty('key'));
            aTokens[i].setKey('site');
          }
        }
        this._oMultiInputSite.setTokens(aTokens);
        this.oAppModel.setProperty("/enteredStoreID", "");
        this.onStoreIDFilterBarSearch();
        this._oDialogPopup.close();
      },
      //on Article Value help Request
      onArticleIdVHReq: function (oEvent) {
        var sMultiInputId = oEvent.getParameter("id");
        if (this.getView()) {
          Fragment.load({
            name: "safetystockdistributioncenter.fragment.Article",
            controller: this,
            id: "articleValueHelp"
          }).then(function (oDialog) {
            this._oArtcleDialogPopup = oDialog;
            this.getView().addDependent(oDialog);
            if (sMultiInputId.includes('createArticle')) {
              this.oAppModel.setProperty("/enableArticleSupportRanges", false);
            }
            else {
              this.oAppModel.setProperty("/enableArticleSupportRanges", true);
              oDialog.setRangeKeyFields([{
                label: this.i18nModel.getProperty("article"),
                key: "article"
              }]);
            }
            this.setVHSettingsArticleID(oDialog, sMultiInputId);
            oDialog.setTokens(this._oMultiInputArticle.getTokens());
            oDialog.open();
          }.bind(this))
        }
      },
      //Binding the values to the Store ID value help
      setVHSettingsArticleID: function (oDialog, sMultiInputId) {
        // basic search 
        if (oDialog.getFilterBar()) {
          var oSearchField = new sap.m.SearchField({
            showSearchButton: true,
            value: "{appModel>/enteredArticleID}",
            change: this.onArticleIDFilterBarSearch.bind(this)
          })
          oDialog.getFilterBar().setBasicSearch(oSearchField);
        }
        oDialog.getTable().setModel(this.oDataModel);
        oDialog.getTableAsync().then(function (oTable) {
          this._oTableVH = oTable;
          var that = this;
          var oColModel = new sap.ui.model.json.JSONModel({
            "cols": [{
              "label": this.i18nModel.getProperty("article"),
              "template": "article",
              "width": "5rem"
            },
            {
              "label": this.i18nModel.getProperty("artDesc"),
              "template": "articleDesc",
              "width": "15rem"
            }
            ]
          });
          if (sMultiInputId.includes('createArticle')) {
            oTable.setSelectionMode('Single');
            oTable.attachRowSelectionChange(
              function () {
                oDialog.setTokens([]);
                var iIndex = that._oTableVH.getSelectedIndex();
                if (iIndex != -1) {
                  var sText = that._oTableVH.getContextByIndex(iIndex).getObject().article;
                  that._oTableVH.getParent().getParent().getParent().getParent().setTokens([new sap.m.Token({
                    key: sText, text: sText
                  })])
                }
              }
            )
          }
          oTable.setModel(oColModel, "columns");
          if (oTable.bindRows) {
            oTable.bindAggregation("rows", "/ProductSet");
          }
          oDialog.update();
        }.bind(this));
      },
      //Search functionality inside the Store ID value help
      onArticleIDFilterBarSearch: function () {
        var oFinalFilter = [];
        if (this.oAppModel.getProperty("/enteredArticleID").length > 0) {
          oFinalFilter.push(new Filter("article", FilterOperator.EQ, this.oAppModel.getProperty("/enteredArticleID")));
        }
        this._oTableVH.bindRows({
          path: "/ProductSet",
          filters: oFinalFilter
        })
      },
      // event triggers on click of Cancel button in Article value help
      onArticleValueHelpCancelPress: function () {
        this.oAppModel.setProperty("/enteredArticleID", "");
        this.onArticleIDFilterBarSearch();
        this._oArtcleDialogPopup.close();
      },
      // destroys fragment control
      onArticleAfterClose: function () {
        this._oArtcleDialogPopup.destroy();
      },
      // event triggers on click of OK button in Article value help
      onArticleValueHelpOkPress: function (oEvent) {
        var aTokens = oEvent.getParameter("tokens");
        for (var i = 0; i < aTokens.length; i++) {
          if (aTokens[i].data('range') !== null) {
            aTokens[i].data('range').keyField = "article"
            if (aTokens[i].data('range').exclude) {
              aTokens[i].data('range').operation = "NE"
            }
          } else {
            aTokens[i].setText(aTokens[i].getProperty('key'));
            aTokens[i].setKey('article');
          }
        }
        this._oMultiInputArticle.setTokens(aTokens);
        this.oAppModel.setProperty("/enteredArticleID", "");
        this.onArticleIDFilterBarSearch();
        this._oArtcleDialogPopup.close();
      },
      //On clicking on Job Id  Value help
      onJobIdVHReq: function () {
        if (this.getView()) {
          Fragment.load({
            name: "safetystockdistributioncenter.fragment.JobId",
            controller: this
          }).then(function (oDialog) {
            this._oJobDialogPopup = oDialog;
            this.getView().addDependent(oDialog);
            oDialog.setRangeKeyFields([{
              label: this.i18nModel.getProperty("jobId"),
              key: "JobID",
            }]);
            this.setVHSettingsJobId(oDialog);
            oDialog.setTokens(this._oMultiInputJobId.getTokens());
            oDialog.open();
          }.bind(this))
        }
      },
      //Binding the values to the Site  value help
      setVHSettingsJobId: function (oDialog) {
        // basic search
        if (oDialog.getFilterBar()) {
          var oSearchField = new sap.m.SearchField({
            showSearchButton: true,
            value: "{appModel>/enteredJobId}",
            change: this.onJobIdFilterBarSearch.bind(this),
            submit: this.onJobIdFilterBarSearch.bind(this)
          })
          oDialog.getFilterBar().setBasicSearch(oSearchField);
        }
        oDialog.getTable().setModel(this.oDataModel);
        oDialog.getTableAsync().then(function (oTable) {
          this._oJobTableVH = oTable;
          var oColModel = new sap.ui.model.json.JSONModel({
            "cols": [{
              "label": this.i18nModel.getProperty("jobId"),
              "template": "JobID",
              "width": "20rem"
            }
            ]
          });
          oTable.setModel(oColModel, "columns");
          if (oTable.bindRows) {
            oTable.bindAggregation("rows", "/F4JobId");
          }
          oDialog.update();
        }.bind(this));

      },
      //Search functionality inside the Job ID value help
      onJobIdFilterBarSearch: function () {
        var oFinalFilter = [];
        if (this.oAppModel.getProperty("/enteredJobId").length > 0) {
          oFinalFilter.push(new Filter("JobID", FilterOperator.EQ, this.oAppModel.getProperty("/enteredJobId")));
        }
        this._oJobTableVH.bindRows({
          path: "/F4JobId",
          filters: oFinalFilter
        })
      },
      // event triggers on click of Cancel button in Job ID value help
      onJobIdVHCancelPress: function () {
        this.oAppModel.setProperty("/enteredJobId", "");
        this.onJobIdFilterBarSearch();
        this._oJobDialogPopup.close();
      },
      // event triggers on click of OK button in Job value help
      onJobIdVHokPress: function (oEvent) {
        var aTokens = oEvent.getParameter("tokens");
        for (var i = 0; i < aTokens.length; i++) {
          if (aTokens[i].data('range') !== null) {
            aTokens[i].data('range').keyField = 'JobID'
            if (aTokens[i].data('range').exclude) {
              aTokens[i].data('range').operation = "NE"
            }
          } else {
            aTokens[i].setText(aTokens[i].getProperty('key'));
            aTokens[i].setKey('JobID');
          }
        }
        this._oMultiInputJobId.setTokens(aTokens);
        this.oAppModel.setProperty("/enteredJobId", "");
        this.onJobIdFilterBarSearch();
        this._oJobDialogPopup.close();
      },
      //Parse error Error message
      getErrorMessage: function (oError) {
        var sErrorString = this.i18nModel.getProperty("readcallfail");
        if (oError !== undefined || oError !== null) {
          if (oError.hasOwnProperty("responseText")) {
            if (oError.responseText) {
              var errorData = JSON.parse(oError.responseText);
              if (errorData.error && errorData.error.code
                && errorData.error.message && errorData.error.message.value) {
                sErrorString = errorData.error.code + " : " + errorData.error.message.value;
              } else if (errorData.code && errorData.message) {
                sErrorString = errorData.code + " : " + errorData.message;
              }
            }
            else if (oError.hasOwnProperty("message")) {
              if (oError.message) {
                sErrorString = oError.message;
              }
            }
          }
        }
        return sErrorString;
      }
    });
  }
);