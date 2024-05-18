sap.ui.define([
    "./App.controller",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageBox",
    "sap/ui/core/Fragment",
    "sap/ui/export/Spreadsheet",
    "safetystockdistributioncenter/utils/jszip",
    "safetystockdistributioncenter/utils/xlsx",
    "safetystockdistributioncenter/Constants"
],
    /**
     * @param {typeof sap.ui.core.mvc.Controller} Controller
     */
    function (Controller, Filter, FilterOperator, MessageBox, Fragment, Spreadsheet, jszip, xlsx,Constants) {
        "use strict";
        return Controller.extend("safetystockdistributioncenter.controller.Home", {
            onInit: function () {
                //getting the model
                this.i18nModel = this.getOwnerComponent().getModel("i18n");
                this.oDataModel = this.getOwnerComponent().getModel();
                this.oDatav2 = this.getOwnerComponent().getModel("capData");
                this.oAppModel = this.getOwnerComponent().getModel("appModel");
                this.oRouter = sap.ui.core.UIComponent.getRouterFor(this);
                this.initialSetUp();
            },
            //initial SetUp
            initialSetUp: function () {
                this.oFinalFilter = [];
                this.getFiltersInstances();
                this.oAppModel.setProperty("/enableEdit", false);
                this.oAppModel.setProperty("/enableDelete", false);
                this.oAppModel.setProperty("/enableExport", true);
                this.oAppModel.setProperty('/active', false);
                this.oAppModel.setProperty("/tableDataCount", '(0)');
                this.edited = false;
            },
            //Getting Selection Filter instances
            getFiltersInstances: function () {
                this._oMultiInputArticle = this.getView().byId("idArticle");
                this._oMultiInputSite = this.getView().byId("idSite");
            },
            //on Create Pressed
            onCreate: function () {
                this.oRouter.navTo("Create", { "key": "create" });
            },
            // setting filters for read call
            onSearch: function () {
                if (this.getView()) 
                {
                    this.getView().setBusy(true);
                    this.oFinalFilter = [];
                    this.oFinalFilter.push(new Filter("fulfil", FilterOperator.EQ, Constants.FULFILL));
                    var ids = [
                        "idSite",
                        "idArticle"
                    ]
                    var aSites = this._oMultiInputSite.getTokens(),oDate = [];
                    oDate = this.getView().byId("idDateRange").getValue().split(" - ");
                    var oStartDate = this.getFormattedDateValue(oDate[0]),
                        oEndDate = this.getFormattedDateValue(oDate[1]);
                    if (aSites.length > 0 && oStartDate!="" && oEndDate!="" && oStartDate!=null && oEndDate!=null) {
                        this.oFinalFilter.push(new Filter("validFrom", FilterOperator.GE, oStartDate));
                        this.oFinalFilter.push(new Filter("validTo", FilterOperator.LE, oEndDate));
                        for (var i = 0; i < ids.length; i++) {
                            var oToken = this.getView().byId(ids[i]).getTokens();
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
                        }
                        this.serviceCall(this.oFinalFilter);
                    } else {
                        this.getView().setBusy(false);
                        MessageBox.error(this.i18nModel.getProperty("mandatory"));
                    }
                }
            },
            // read call to backend to get table data
            serviceCall: async function (oFinalFilter) {
                this.oDatav2.read("/SafetyStockMasterSet/$count", {
                    filters: oFinalFilter,
                    success: function (value) {
                        this.oAppModel.setProperty("/tableDataCount", '(' + value + ')');
                    }.bind(this),
                    error: function (oError) {
                        MessageBox.error(this.getErrorMessage(oError));
                    }.bind(this)
                });
                this.oTable = this.getView().byId("idDataTable");
                this.oTable.setShowOverlay(false);
                this.oTable.bindRows({
                    path: "/SafetyStockMasterSet",
                    filters: oFinalFilter
                })
                this.oTable.setModel(this.oDatav2);
                this.oTable.getModel().setDefaultBindingMode(sap.ui.model.BindingMode.TwoWay);
                this.oTable.setBusy(false);
                this.getView().setBusy(false);
            },
            // returns date in yyy-MM-dd format 
            getFormattedDateValue: function (sDateTime) {
                if (sDateTime !== undefined && sDateTime !== null && sDateTime !== "") {
                    var oDateFormat = sap.ui.core.format.DateFormat.getInstance({
                        pattern: "yyyy-MM-dd"
                    });
                    var sOriginalDate = oDateFormat.format(new Date(sDateTime));
                    return sOriginalDate;
                }
                return null;
            },
            //opens upload fragment
            onFileUpload: function () {
                if (this.oUploadDialog) {
                    this.oUploadDialog.open();
                    return;
                }
                // instantiate upload dialog
                Fragment.load({
                    name: "safetystockdistributioncenter.fragment.UploadFragment",
                    type: "XML",
                    controller: this,
                }).then(
                    function (oUploadDialog) {
                        this.getView().addDependent(oUploadDialog);
                        this.oUploadDialog = oUploadDialog;
                        oUploadDialog.open();
                    }.bind(this)
                );
            },
            // Template is downloadable with a defined cloumns
            onTemplateDownloadPress: function () {
                var aRows = [
                    { key: '', value: '' },
                ],
                    aCols = this.createColumnConfig(),
                    oSettings, oSheet;

                // To get the Date
                this.getFileName();
                oSettings = {
                    workbook: { columns: aCols },
                    dataSource: aRows,
                    count: 0,
                    fileName: this.fileName
                };
                oSheet = new Spreadsheet(oSettings);
                oSheet.build()
                    .then(function () {
                    }).finally(function () {
                        oSheet.destroy();
                    });
            },
            //Columns displayed in the table
            createColumnConfig: function () {
                return [
                    {
                        label: this.i18nModel.getProperty("site"),
                        property: ""
                    },
                    {
                        label: this.i18nModel.getProperty("article"),
                        property: ""
                    },
                    {
                        label: this.i18nModel.getProperty("quantity"),
                        property: ""
                    },
                    {
                        label: this.i18nModel.getProperty("validFromUpload"),
                        property: ""
                    },
                    {
                        label: this.i18nModel.getProperty("validToUpload"),
                        property: ""
                    }
                ];
            },
            //To get a file name for excel
            getFileName: function () {
                var today, dateFormat, date;
                today = new Date();
                dateFormat = sap.ui.core.format.DateFormat.getDateInstance({ pattern: "YYYYMMddHHmm" });
                date = dateFormat.format(today);
                this.fileName = this.i18nModel.getProperty("fileName") + '_' + date;
            },
            // triggers in click of export button
            onDownload: function () {
                if (this.getView()) {
                    var aCols, oRowBinding, oSettings, oSheet, oTable;
                    if (!this._oTable) {
                        this._oTable = this.byId('idDataTable');
                    }
                    oTable = this._oTable;
                    oRowBinding = oTable.getBinding('rows');
                    aCols = [{
                        label: this.i18nModel.getProperty("dc"),
                        property: 'site'
                    }, {
                        label: this.i18nModel.getProperty("dcdesc"),
                        property: 'siteDesc',
                    }, {
                        label: this.i18nModel.getProperty("article"),
                        property: 'article',
                    },
                    {
                        label: this.i18nModel.getProperty("artDesc"),
                        property: 'artDesc',
                    },
                    {
                        label: this.i18nModel.getProperty("validFrom"),
                        property: 'validFrom',
                        type: 'Date'
                    },
                    {
                        label: this.i18nModel.getProperty("validTo"),
                        property: 'validTo',
                        type: 'Date'
                    },
                    {
                        label: this.i18nModel.getProperty("quantity"),
                        property: 'sftyDcQty',
                    }
                    ];
                    oSettings = {
                        workbook: { columns: aCols },
                        dataSource: oRowBinding,
                        fileName: this.i18nModel.getProperty("title")
                    };
                    oSheet = new Spreadsheet(oSettings);
                    oSheet.build().finally(function () {
                        oSheet.destroy();
                    });
                }
            },
            //Event triggers on Selecting the file from local machine
            onFileSelectionChange: function (e) {
                this.initialSetUpFileUploader();
                var sEmptyFileError = this.i18nModel.getProperty("emptyFileError");
                // get the file from the FileUploader control
                var file = e.getParameter("files") && e.getParameter("files")[0];
                this.sFileName = file.name;
                if (file) {
                    var reader = new FileReader();
                    reader.onload = function (e) {
                        var data = e.target.result;
                        var workbook = XLSX.read(data, {
                            type: "binary"
                        });
                        var sheetName = workbook.SheetNames[0];
                        var excelData = XLSX.utils.sheet_to_row_object_array(workbook.Sheets[sheetName]);
                        if (excelData.length < 1) {
                            sap.ui.getCore().byId("idFileUploader").clear();
                            MessageBox.error(sEmptyFileError);
                            return;
                        }
                    };
                    reader.readAsBinaryString(file);
                }
            },

            //setting initial parameters to local model
            initialSetUpFileUploader: function () {
                var oFileUploader = sap.ui.getCore().byId("idFileUploader"),
                    sUrl = "/odata/v4/safety-stock-srv/ExcelUpload/excel";
                oFileUploader.setUploadUrl(sUrl);
                oFileUploader.setHttpRequestMethod("PUT");
                oFileUploader.setSendXHR(true);
                oFileUploader.setUseMultipart(false);
                oFileUploader.setUploadOnChange(false);
            },
            //on click of upload and process button event
            onUploadPress: async function () {
                var oFileUploader = sap.ui.getCore().byId("idFileUploader");
                var oFile = oFileUploader.oFileUpload.files[0];
                if (!oFile) {
                    MessageBox.warning(this.i18nModel.getProperty("fileEmptyMessage"));
                    return;
                }
                sap.ui.getCore().byId("idFileUploader").checkFileReadable()
                    .then(this.uploadFile.bind(this));
            },
            //post the file to backend
            uploadFile: function () {
                var oFileUploader = sap.ui.getCore().byId('idFileUploader'),
                    aHeaderParameters = [
                        {
                            name: "accept",
                            value: "application/json",
                        },
                        {
                            name: "SLUG",
                            value: Constants.FULFILL,
                        }
                    ];
                oFileUploader.destroyHeaderParameters();
                aHeaderParameters.forEach(function (oParameter) {
                    oFileUploader.insertHeaderParameter(
                        new sap.ui.unified.FileUploaderParameter(oParameter)
                    );
                });
                oFileUploader.upload();
            },
            // triggers in clicking close button in fragment
            onUploadDialogClose: function () {
                sap.ui.getCore().byId("idFileUploader").clear();
                this.oUploadDialog.close();
            },
            //triggers on click of check log button in fragment
            onCheckLogPress: function () {
                if (this.oRouter) {
                    this.onUploadDialogClose();
                    this.oRouter.navTo("CheckLog");
                }
            },
            //triggers on edit button press
            onEdit: function (oEvent) {
                var aBackUpData = [];
                this.edited= false;
                var oTableInstance = oEvent.getSource().getParent().getParent();
                var aSelectedIndices = oTableInstance.getSelectedIndices();
                $.each(aSelectedIndices, function (index, value) {
                    var sSelectedContextPath = oTableInstance.getContextByIndex(aSelectedIndices[index]).sPath;
                    oTableInstance.getModel().setProperty(sSelectedContextPath + "/IsFlagEditTrue", true);
                    var validTo = oTableInstance.getModel().getProperty(sSelectedContextPath + "/validTo");
                    var sftyDcQty = oTableInstance.getModel().getProperty(sSelectedContextPath + "/sftyDcQty");
                    var obj = {
                        ind: aSelectedIndices[index],
                        validto: validTo,
                        quantity: sftyDcQty
                    };
                    aBackUpData.push(obj);
                })
                this.oAppModel.setProperty("/previousData",aBackUpData);
                this.oAppModel.setProperty('/active', true);
            },
            // triggers on click of delete button 
            onDelete: function () {
                MessageBox.warning(this.i18nModel.getProperty('deleteText'), {
                    actions: [MessageBox.Action.OK, MessageBox.Action.CANCEL],
                    emphasizedAction: MessageBox.Action.OK,
                    onClose: (sAction) => {
                        if (sAction == MessageBox.Action.OK) {
                            this.deleteOperation();
                        }
                    }
                });
            },
            deleteOperation :async function(){
                var that=this;
                let oBindList = this.oDataModel.bindList("/SafetyStockMasterSet");
                var oTable = this.getView().byId("idDataTable");
                var aSelectedIndices = oTable.getSelectedIndices(), oItem, oFilter = [new Filter("fulfil", FilterOperator.EQ, Constants.FULFILL)];
                for (var i = 0; i < aSelectedIndices.length; i++) {
                    oItem = oTable.getContextByIndex(aSelectedIndices[i]).getObject();
                    oFilter.push(new Filter("site", FilterOperator.EQ, oItem.site));
                    oFilter.push(new Filter("article", FilterOperator.EQ, oItem.article));
                    oFilter.push(new Filter("validFrom", FilterOperator.EQ, this.dateFormat(oItem.validFrom)));
                    oFilter.push(new Filter("validTo", FilterOperator.EQ, this.dateFormat(oItem.validTo)));
                }
                var deletedPromises = [];
                await oBindList.filter(oFilter).requestContexts().then(function (aContexts) {
                    $.each(aContexts, function (index, value) {
                        var promise = aContexts[index].delete();
                        deletedPromises.push(promise);
                    });
                });
                await Promise.all(deletedPromises).then(function(){
                    MessageBox.success(that.i18nModel.getProperty("deleteSuccess"));
                }).catch(function(){
                    MessageBox.error(that.i18nModel.getProperty("deleteFail"));
                });
                await this.serviceCall(this.oFinalFilter);
                if (oTable.getSelectedIndices().length > 0) {
                    this.oAppModel.setProperty("/enableEdit", true);
                    this.oAppModel.setProperty("/enableDelete", true);
                } else {
                    this.oAppModel.setProperty("/enableDelete", false);
                    this.oAppModel.setProperty("/enableEdit", false);
                    this.oAppModel.setProperty('/active', false);
                }
            },
            // triggers on table row selection change
            onSelectionChange: function (oEvent) {
                this.getView().setBusy(true);
                var oTable = this.getView().byId("idDataTable");
                var aSelectedIndices = oTable.getSelectedIndices();
                var oRowContext = oEvent.getParameter('rowContext');
                var oRowIndex = oEvent.getParameter('rowIndex');
                if(oRowContext!== null && oRowIndex !== -1 && !this.edited){
                    var sRowSPath = oRowContext.sPath;
                    var bEditFlag = this.oDatav2.getProperty(sRowSPath).IsFlagEditTrue;
                    if (bEditFlag) {
                        this.oDatav2.setProperty(sRowSPath+"/IsFlagEditTrue",false);
                        var aPreviousData = this.oAppModel.getProperty('/previousData');
                        aPreviousData.forEach((i) => {
                            if (i.ind === oRowIndex) {
                                this.oDatav2.setProperty(sRowSPath + "/validTo", i.validto);
                                this.oDatav2.setProperty(sRowSPath + "/sftyDcQty", i.quantity);
                            }
                        })
                        aSelectedIndices.forEach(function(index){
                            oTable.addSelectionInterval(index,index);
                        });
                    }
                }
                else if(!this.edited)
                    {
                    this.oDatav2.resetChanges();
                    this.oDataModel.refresh();
                    oTable.getModel().refresh();
                }
                if (aSelectedIndices.length > 0) {
                    this.oAppModel.setProperty("/enableEdit", true);
                    this.oAppModel.setProperty("/enableDelete", true);
                } else {
                    this.oAppModel.setProperty("/enableDelete", false);
                    this.oAppModel.setProperty("/enableEdit", false);
                    this.oAppModel.setProperty("/active",false);
                }
                this.getView().setBusy(false);
            },
            ///cancel function
            onCancel: function (oEvent) {
                var that = this;
                MessageBox.warning(this.i18nModel.getProperty('cancelText'), {
                    actions: [MessageBox.Action.OK, MessageBox.Action.CANCEL],
                    emphasizedAction: MessageBox.Action.OK,
                    onClose: (sAction) => {
                        if (sAction == MessageBox.Action.OK) {
                            that.restoreView();
                        }
                    }
                });
            },
            //restores data back on edit cancel
            restoreView: function () {
                var oTableInstance = this.getView().byId("idDataTable");
                var aSelectedIndices = oTableInstance.getSelectedIndices();
                $.each(aSelectedIndices, function (index, value) {
                    var sSelectedContextPath = oTableInstance.getContextByIndex(aSelectedIndices[index]).sPath;
                    oTableInstance.getModel().setProperty(sSelectedContextPath + "/IsFlagEditTrue", false);
                })
                this.oAppModel.setProperty('/active', false);
                oTableInstance.clearSelection();
                this.oDatav2.resetChanges();
                this.oDatav2.refresh();
                oTableInstance.getModel().refresh();
            },
            getTodayDate: function(){
                var oDate = new Date();
                var sDate = oDate.getDate() < 10 ? "0"+oDate.getDate() : oDate.getDate();
                var sMonth = (oDate.getMonth()+1)  < 10 ? "0"+(oDate.getMonth()+1) : (oDate.getMonth()+1);
                var sYear = oDate.getFullYear();
                return sYear + '-'+ sMonth + '-'+ sDate;
            },
            // triggers on click of save button in edit mode 
            onSave: async function (oEvent) {
                var that = this;
                var oTableInstance = oEvent.getSource().getParent().getParent().getParent().byId('idDataTable');
                var aSelectedIndices = oTableInstance.getSelectedIndices(), oUpdateFields;
                var sTodayDate = new Date(that.getTodayDate() + 'T00:00:00');
                that.sErrorText = '';
                let aUpdateFields = [];
                oTableInstance.setBusy(true);
                for (var i = 0; i < aSelectedIndices.length; i++) {
                    var sSelectedContextPath = oTableInstance.getContextByIndex(aSelectedIndices[i]).sPath;
                    var iSftyDcQty = oTableInstance.getModel().getProperty(sSelectedContextPath + "/sftyDcQty");
                    var sValidTo = new Date(that.dateFormat(oTableInstance.getModel().getProperty(sSelectedContextPath + "/validTo")) + 'T00:00:00');
                    var sValidFrom = new Date(that.getFormattedDateValue(oTableInstance.getModel().getProperty(sSelectedContextPath + "/validFrom")) + 'T00:00:00');
                    if (isNaN(Date.parse(sValidTo))) {
                        var sSite = oTableInstance.getModel().getProperty(sSelectedContextPath + "/site");
                        var sArticle = oTableInstance.getModel().getProperty(sSelectedContextPath + "/article");
                        that.sErrorText += this.i18nModel.getProperty('editdtfrmtinc') + '\n' + sArticle + " " + this.i18nModel.getProperty("and") + " " + sSite + '\n';
                        break;
                    }
                    if (iSftyDcQty === null || iSftyDcQty === '' || that.dateFormat(sValidTo) === null || that.dateFormat(sValidTo) === '') {
                        var sSite = oTableInstance.getModel().getProperty(sSelectedContextPath + "/site");
                        var sArticle = oTableInstance.getModel().getProperty(sSelectedContextPath + "/article");
                        that.sErrorText += this.i18nModel.getProperty('checkBlankMsg') + '\n' + sSite + " " + this.i18nModel.getProperty("and") + " " + sArticle + '\n';
                        break;
                    }
                    if (sValidTo.toDateString() === new Date().toDateString() || sValidTo > new Date()) {
                        if (sValidTo < sValidFrom) {
                            var sSite = oTableInstance.getModel().getProperty(sSelectedContextPath + "/site");
                            var sArticle = oTableInstance.getModel().getProperty(sSelectedContextPath + "/article");
                            that.sErrorText += this.i18nModel.getProperty('checkDateMsg') + '\n' + sSite + " " + that.i18nModel.getProperty("and") + " " + sArticle + '\n';
                            break;
                        }
                    }
                    if (sValidTo < sTodayDate) {
                        var sSite = oTableInstance.getModel().getProperty(sSelectedContextPath + "/site");
                        var sArticle = oTableInstance.getModel().getProperty(sSelectedContextPath + "/article");
                        that.sErrorText += sSite + " " + that.i18nModel.getProperty("and") + " " + sArticle + " " + that.i18nModel.getProperty("vldtopster") + '\n';
                        break;
                    }
                    if (iSftyDcQty == 0) {
                        var sSite = oTableInstance.getModel().getProperty(sSelectedContextPath + "/site");
                        var sArticle = oTableInstance.getModel().getProperty(sSelectedContextPath + "/article");
                        that.sErrorText += this.i18nModel.getProperty('checkQtyMsg') + '\n' + sSite + " " + that.i18nModel.getProperty("and") + " " + sArticle + '\n';
                        break;
                    }
                    else {
                        var sSite = oTableInstance.getModel().getProperty(sSelectedContextPath + "/site");
                        var sArticle = oTableInstance.getModel().getProperty(sSelectedContextPath + "/article");
                        var sValidFrom = that.dateFormat(oTableInstance.getModel().getProperty(sSelectedContextPath + "/validFrom"));
                        oUpdateFields = {
                            site: sSite,
                            article: sArticle,
                            fulfil: Constants.FULFILL,
                            validFrom: that.dateFormat(sValidFrom),
                            sftyDcQty: parseInt(iSftyDcQty),
                            validTo: that.dateFormat(sValidTo)
                        }
                        aUpdateFields.push(oUpdateFields);
                    }
                }
                if (that.sErrorText != '') {
                    MessageBox.error(this.sErrorText);
                    oTableInstance.setBusy(false);
                } else {
                    var oActionODataContextBinding = this.getView().getModel().bindContext("/UpdateDCDetailsSet(...)");
                    oActionODataContextBinding.setParameter("SiteSet", aUpdateFields);
                    oActionODataContextBinding.execute()
                        .then(
                            function () {
                                oTableInstance.setBusy(false);
                                oTableInstance.getModel().resetChanges();
                                MessageBox.success(that.i18nModel.getProperty("updateSuccess"));
                                that.edited = true;
                                oTableInstance.clearSelection();
                                oTableInstance.getModel().refresh();
                            }.bind(this)
                        )
                        .catch(
                            function () {
                                MessageBox.error(that.i18nModel.getProperty("updateFail"));
                                oTableInstance.setBusy(false);
                            }
                        );
                }
            },
            // formats date to yyyy-MM-dd format 
            dateFormat: function (sValue) {
                if (sValue !== null && sValue !== undefined && sValue !== '') {
                    if (isNaN(Date.parse(sValue))) {
                        return sValue;
                    } else {
                        var iCurrentTimeZoneOffset = new Date().getTimezoneOffset();
                        if(Math.sign(iCurrentTimeZoneOffset)=== -1){
                            var oDateFormat = sap.ui.core.format.DateFormat.getInstance({
                                pattern: "yyyy-MM-dd"
                            });
                        }else{
                            var oDateFormat = sap.ui.core.format.DateFormat.getInstance({
                                pattern: "yyyy-MM-dd",
                                UTC : true
                            });
                        }
                        return oDateFormat.format(new Date(sValue));
                    }
                }
                return sValue;
            },
            //On Date Picker value changed
            onDatePickerChange: function (oEvent) {
                var oDatePicker = oEvent.getSource();
                var sDateValue = oDatePicker.getProperty('value');
                var sSelectedContextPath = oDatePicker.getParent().getBindingContext().sPath;
                oDatePicker.getParent().getParent().getModel().setProperty(sSelectedContextPath + "/validTo", sDateValue);
            },
            onUploadComplete: function(oEvent){
                var iStatus = oEvent.getParameter('status');
                if(iStatus>=200 && iStatus<=300){
                    var sJobId = JSON.parse(oEvent.getParameter('headers')["sap-messages"])[0].message;
                    MessageBox.success(this.i18nModel.getProperty("fileSubmitted") + sJobId)
                }
                else if(iStatus == 400){
                    var oError = JSON.parse(oEvent.getParameter('responseRaw')).error;
                    MessageBox.error(oError.message);
                    sap.ui.getCore().byId("idFileUploader").clear();
                }
            },
            //Setting and Re-setting Value state of Date Picker
            valueState: function(sValue){
                if (sValue !== null && sValue !== undefined && sValue !== '') {
                    if (isNaN(Date.parse(sValue))) {
                        return 'Error';
                    } else {
                        return 'None';
                    }
                }
                return 'None';
            },
            handleChange: function(oEvent){
                var aDateRange = oEvent.getParameter('value').split(' - ');
                var sStartDate = this.getFormattedDateValue(aDateRange[0]);
                var sEndDate = this.getFormattedDateValue(aDateRange[1]);
                if(sStartDate !== '' && sEndDate !== '' && sStartDate !== null && sEndDate !== null){
                    oEvent.getSource().setValueState('None');
                    oEvent.getSource().setValueStateText('');
                    this.bDateRange = true;
                }else{
                    oEvent.getSource().setValueState('Error');
                    oEvent.getSource().setValueStateText('Enter correct date range');
                    this.bDateRange = false;
                }
            }
        });
    });