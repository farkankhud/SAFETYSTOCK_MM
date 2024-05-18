sap.ui.define([
    "./App.controller",
    "sap/m/MessageBox",
    "safetystockdistributioncenter/Constants"
],
    /**
     * @param {typeof sap.ui.core.mvc.Controller} Controller
     */
    function (BaseController, MessageBox, Constants) {
        "use strict";

        return BaseController.extend("safetystockdistributioncenter.controller.Create", {
            onInit: function () {
                this.i18nModel = this.getOwnerComponent().getModel("i18n");
                this.oAppModel = this.getOwnerComponent().getModel("appModel");
                this._oMultiInputArticle = this.getView().byId("createArticle");
                this._oMultiInputSite = this.getView().byId("createSite");
                this.sDCQuantity = this.getView().byId('createQuantity');
                this.sDCValidFrom = this.getView().byId('sfsStartDate');
                this.sDCValidTo = this.getView().byId('sfsEndDate');
                this.dQuantityFlag = true;
                this.dValidFrom = true;
                this.dValidTo = true;
                this.oRouter = this.getOwnerComponent().getRouter();
            },
            // checks for mandatory fields during create operation
            mandatoryChecks: function () {
                var aSiteTokenArray = this._oMultiInputSite.getTokens();
                var aArticleRokenArray = this._oMultiInputArticle.getTokens();
                var sDCQuantity = this.sDCQuantity.getValue();
                var sDCValidFrom = this.sDCValidFrom.getValue();
                var sDCValidTo = this.sDCValidTo.getValue();
                if (aSiteTokenArray.length === 0) {
                    MessageBox.error(this.i18nModel.getProperty("enterSite"));
                    return false;
                } else if (aArticleRokenArray.length === 0) {
                    MessageBox.error(this.i18nModel.getProperty("enterArticle"));
                    return false;
                } else if (sDCQuantity === '') {
                    MessageBox.error(this.i18nModel.getProperty("enterQuantity"));
                    return false;
                } else if (sDCValidFrom === '') {
                    MessageBox.error(this.i18nModel.getProperty("enterValidFrom"));
                    return false;
                } else if (sDCValidTo === '') {
                    MessageBox.error(this.i18nModel.getProperty("enterValidTo"));
                    return false;
                } else {
                    return true;
                }
            },
            // checks for valid fields during create operation
            enteredValueCheck: function () {
                if (!this.dQuantityFlag) {
                    MessageBox.error(this.i18nModel.getProperty("enterValidQty"));
                    return false;
                } else if (!this.dValidFrom) {
                    MessageBox.error(this.i18nModel.getProperty("enterValidFromMsg"));
                    return false;
                } else if (!this.dValidTo) {
                    MessageBox.error(this.i18nModel.getProperty("enterValidToMsg"));
                    return false;
                } else {
                    var oCreateObject = {
                        site : this._oMultiInputSite.getTokens()[0].getProperty('text'),
                        article : this._oMultiInputArticle.getTokens()[0].getProperty('text'),
                        fulfil : Constants.FULFILL,
                        validFrom :  this.sDCValidFrom.getValue(),
                        validTo : this.sDCValidTo.getValue(),
                        status : "",
                        sftyDcQty : parseInt(this.sDCQuantity.getValue())
                    }
                    this.oAppModel.setProperty('/CreateData', oCreateObject);
                    return true;
                }
            },
            // triggers on click of save button in create screen
            onCreateSave: async function () {
                var bMandatoryCheck = this.mandatoryChecks();
                var bEnteredValueCheck = this.enteredValueCheck();
                if (bMandatoryCheck && bEnteredValueCheck) {
                    var that = this;
                    this.getView().setBusy(true);
                    let oModel = this.getView().getModel();
                    let oBindList = oModel.bindList("/SafetyStockMasterSet");
                    oBindList.attachCreateCompleted(function (oEvent) {
                        that.getView().setBusy(false);
                        var bSuccess = oEvent.getParameter('success');
                        if (!bSuccess) {
                            var aTimeStamp = [];
                            var aMessage = oEvent.getParameter('context').getModel().getMessagesByPath("");
                            $.each(aMessage, function (index, value) {
                                aTimeStamp.push(aMessage[index].date);
                            });
                            var index = aTimeStamp.indexOf(Math.max(...aTimeStamp));
                            var sMessage = aMessage[index].message;
                            MessageBox.error(sMessage);
                        } else {
                            MessageBox.success(that.i18nModel.getProperty("success"), {
                                icon: MessageBox.Icon.SUCCESS,
                                emphasizedAction: MessageBox.Action.OK,
                                actions: [MessageBox.Action.OK],
                                onClose: function (oAction) {
                                    if (oAction == "OK") {
                                        that._oMultiInputArticle.setTokens([]);
                                        that._oMultiInputSite.setTokens([]);
                                        that.sDCQuantity.setValue('');
                                        that.sDCValidFrom.setValue('');
                                        that.sDCValidTo.setValue('');
                                        that.oRouter.navTo("RouteHome");
                                    }
                                }.bind(this)
                            });
                        }
                    });
                    var oCreateObject = this.oAppModel.getProperty('/CreateData');
                    var oCreate = oBindList.create({
                        site: oCreateObject.site,
                        article: oCreateObject.article,
                        fulfil: oCreateObject.fulfil,
                        validFrom: oCreateObject.validFrom,
                        validTo: oCreateObject.validTo,
                        siteCategory: "",
                        status: oCreateObject.status,
                        artDesc: "",
                        sftyBopPer: 0,
                        sftySfsPer: 0,
                        sftyDcQty:  oCreateObject.sftyDcQty,
                        sftyTotPer: 0,
                        IsFlagEditTrue : oCreateObject.IsFlagEditTrue
                    });
                    oCreate.created();
                }
            },
            // quantity field validation in create 
            quantityCheck: function (oEvent) {
                var icurrentValue = parseInt(oEvent.getParameters().value);
                if (icurrentValue === 0) {
                    oEvent.getSource().setValueState('Error');
                    if (icurrentValue === 0) {
                        oEvent.getSource().setValueStateText(this.i18nModel.getProperty("qtyCheck"));
                    }
                    this.dQuantityFlag = false;
                } else {
                    oEvent.getSource().setValueState('None');
                    oEvent.getSource().setValueStateText('');
                    this.dQuantityFlag = true;
                }
            },
            // event triggers on Start Date change for validation in create
            sfsStartDateChange: function (oEvent) {
                var oStartDate = new Date(oEvent.getParameters().value+"T00:00:00");
                var sEndDate = this.getView().byId('sfsEndDate').getValue();
                if (oStartDate.toDateString() === new Date().toDateString() || oStartDate > new Date()) {
                    oEvent.getSource().setValueState('None');
                    oEvent.getSource().setValueStateText('');
                    this.dValidFrom = true;
                    if (sEndDate !== null && sEndDate !== undefined && sEndDate !== '') {
                        var oEndDate = new Date(sEndDate+"T00:00:00");
                        if (oStartDate > oEndDate) {
                            oEvent.getSource().setValueState('Error');
                            oEvent.getSource().setValueStateText(this.i18nModel.getProperty("startEndDateCheck"));
                            this.dValidFrom = false;
                        }
                        else if(oStartDate <= oEndDate && oEndDate > new Date()){
                            oEvent.getSource().setValueState('None');
                            oEvent.getSource().setValueStateText('');
                            this.getView().byId('sfsEndDate').setValueState('None');
                            this.getView().byId('sfsEndDate').setValueStateText('');
                            this.dValidFrom = true;
                            this.dValidTo = true;
                        } else {
                            oEvent.getSource().setValueState('None');
                            oEvent.getSource().setValueStateText('');
                            this.dValidFrom = true
                        }
                    }
                } else {
                    oEvent.getSource().setValueState('Error');
                    oEvent.getSource().setValueStateText(this.i18nModel.getProperty("startDateCheck"));
                    this.dValidFrom = false;
                }
            },
            // event triggers on End Date change for validation in create
            sfsEndDateChange: function (oEvent) {
                var oEndDate = new Date(oEvent.getParameters().value+"T00:00:00");
                var sStartDate = this.getView().byId('sfsStartDate').getValue();
                if (oEndDate.toDateString() === new Date().toDateString() || oEndDate > new Date()) {
                    oEvent.getSource().setValueState('None');
                    oEvent.getSource().setValueStateText('');
                    this.dValidTo = true;
                    if (sStartDate !== null && sStartDate !== undefined && sStartDate !== '') {
                        var oStartDate = new Date(sStartDate+"T00:00:00");
                        if (oEndDate < oStartDate) {
                            oEvent.getSource().setValueState('Error');
                            oEvent.getSource().setValueStateText(this.i18nModel.getProperty("endStartDateCheck"));
                            this.dValidTo = false;
                        }
                        else if(oStartDate <= oEndDate && oStartDate > new Date()){
                            oEvent.getSource().setValueState('None');
                            oEvent.getSource().setValueStateText('');
                            this.getView().byId('sfsStartDate').setValueState('None');
                            this.getView().byId('sfsStartDate').setValueStateText('');
                            this.dValidFrom = true;
                            this.dValidTo = true;
                        } else {
                            oEvent.getSource().setValueState('None');
                            oEvent.getSource().setValueStateText('');
                            this.dValidTo = true
                        }
                    }
                } else {
                    oEvent.getSource().setValueState('Error');
                    oEvent.getSource().setValueStateText(this.i18nModel.getProperty("endDateCheck"));
                    this.dValidTo = false;
                }
            },
            // event triggers on clicking cancel button in create popup
            onCreateCancel: function(){
                this._oMultiInputArticle.setTokens([]);
                this._oMultiInputSite.setTokens([]);
                this.sDCQuantity.setValue('');
                this.sDCValidFrom.setValue('');
                this.sDCValidTo.setValue('');
                this.sDCQuantity.setValueState('None');
                this.sDCValidFrom.setValueState('None');
                this.sDCValidTo.setValueState('None');
                this.oRouter.navTo("RouteHome");
            },
            //navigates back to home screen 
            onNavBack : function(){
                this._oMultiInputArticle.setTokens([]);
                this._oMultiInputSite.setTokens([]);
                this.sDCQuantity.setValue('');
                this.sDCValidFrom.setValue('');
                this.sDCValidTo.setValue('');
                this.sDCQuantity.setValueState('None');
                this.sDCValidFrom.setValueState('None');
                this.sDCValidTo.setValueState('None');
                this.oRouter.navTo("RouteHome");
            }
        });
    });