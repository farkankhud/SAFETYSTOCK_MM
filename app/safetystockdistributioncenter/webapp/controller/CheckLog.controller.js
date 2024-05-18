sap.ui.define([
    "./App.controller",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/export/Spreadsheet",
    "safetystockdistributioncenter/Constants"
],
    /**
     * @param {typeof sap.ui.core.mvc.Controller} Controller
     */
    function (BaseController, Filter, FilterOperator, Spreadsheet,Constants) {
        "use strict";
        return BaseController.extend("safetystockdistributioncenter.controller.CheckLog", {
            onInit: function () {
                this._oMultiInputJobId = this.getView().byId("idJobId");
                this.oDataModel = this.getOwnerComponent().getModel();
                this.oDataV2 = this.getOwnerComponent().getModel('capData');
                this.oAppModel = this.getOwnerComponent().getModel("appModel");
                this.i18nModel = this.getOwnerComponent().getModel("i18n");
                this.oRouter = sap.ui.core.UIComponent.getRouterFor(this);
            },
            //triggers on click of Go button
            onSearch: function () {
                if (this.getView()) {
                    this.getView().setBusy(true);
                    this.oFinalFilter = [];
                    this.oFinalFilter.push(new Filter("fulfil", FilterOperator.EQ, Constants.FULFILL));
                    var oToken = this._oMultiInputJobId.getTokens();
                    if (oToken.length > 0) {
                        for (var j = 0; j < oToken.length; j++) {
                            if (oToken[j].data('range') !== null) {
                                var oFilter = new Filter({
                                    path: oToken[j].data('range').keyField,
                                    operator: oToken[j].data('range').operation,
                                    value1: oToken[j].data('range').value1,
                                    value2: oToken[j].data('range').value2
                                });
                            } else {
                                var oFilter = new Filter({
                                    path: oToken[j].getProperty('key'),
                                    operator: 'EQ',
                                    value1: oToken[j].getProperty('text'),
                                });
                            }
                            this.oFinalFilter.push(oFilter);
                        }
                    }
                    this.serviceCall(this.oFinalFilter);
                }
            },
            //get call to backend
            serviceCall: function (oFinalFilter) {
                this.oDataV2.read("/SafetyStockErrStageSet/$count", {
                    filters: oFinalFilter,
                    success: function (value) {
                        this.oAppModel.setProperty('/errorTableCount',"("+ value+ ")");
                    }.bind(this),
                    error: function (oError) {

                    }.bind(this)
                });
                this.oTable = this.getView().byId("idCheckLogTable");
                this.oTable.setShowOverlay(false);
                this.oTable.bindRows({
                    path: "/SafetyStockErrStageSet",
                    filters: oFinalFilter
                })
                this.oTable.setModel(this.oDataModel);
                this.getView().setBusy(false);
            },
            //navigates back to home screen
            onNavBack: function () {
                this.oRouter.navTo("RouteHome");
            },
            // exports table data to excel 
            onDownloadCheckLog: function () {
                if (this.getView()) {
                    var aCols, oRowBinding, oSettings, oSheet, oTable;
                    if (!this._oTable) {
                        this._oTable = this.byId('idCheckLogTable');
                    }
                    oTable = this._oTable;
                    oRowBinding = oTable.getBinding('rows');
                    aCols = [
                        {
                            label: this.i18nModel.getProperty("jobId"),
                            property: 'JobID'
                        },
                        {
                            label: this.i18nModel.getProperty("createdBy"),
                            property: 'createdBy'
                        },
                        {
                            label: this.i18nModel.getProperty("createdAt"),
                            property: 'createdAt'
                        },
                        {
                            label: this.i18nModel.getProperty("site"),
                            property: 'site'
                        },
                        {
                            label: this.i18nModel.getProperty("article"),
                            property: 'article',
                        },
                        {
                            label: this.i18nModel.getProperty("fulfilMethod"),
                            property: 'fulfil',
                        },
                        {
                            label: this.i18nModel.getProperty("status"),
                            property: 'status',
                        },
                        {
                            label: this.i18nModel.getProperty("validFrom"),
                            property: 'validFrom'
                        },
                        {
                            label: this.i18nModel.getProperty("validTo"),
                            property: 'validTo'
                        },
                        {
                            label: this.i18nModel.getProperty("percentage"),
                            property: 'sftyTotPer',
                        },
                        {
                            label: this.i18nModel.getProperty("quantity"),
                            property: 'sftyDcQty',
                        },
                        {
                            label: this.i18nModel.getProperty("error"),
                            property: 'error',
                        }
                    ];
                    oSettings = {
                        workbook: { columns: aCols },
                        dataSource: oRowBinding,
                        fileName: this.i18nModel.getProperty("titleDCCheckLog")
                    };
                    oSheet = new Spreadsheet(oSettings);
                    oSheet.build().finally(function () {
                        oSheet.destroy();
                    });
                }
            },
        });
    });