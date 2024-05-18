using { safetystock as ss } from '../db/SafetyStock-db';
// using {API_PRODUCT_SRV as external1} from './external/API_PRODUCT_SRV.csn';
// using {ZMM_VALIDATE_STORE_SRV as storeLookup} from './external/ZMM_VALIDATE_STORE_SRV';


@cds.query.limit.max: 1000000000
    @cds.query.limit: 0
service SafetyStockSrv   {
    
    // @restrict:[{
    //     grant: '*',
    //     to: 'ULTA_SS_SFS_MAINTAIN'
    // }, {
    //     grant: '*',
    //     to: 'ULTA_SS_BOPIS_MAINTAIN'
    // }, {
    //     grant: '*',
    //     to: 'ULTA_SS_DC_MAINTAIN'
    // }, {
    //     grant: '*',
    //     to: 'system-user'
    // }, {
    //     grant: '*',
    //     to: 'internal-user'
    // }]
    // Common entity set to display data in table.
    entity SafetyStockMasterSet as projection on ss.ZMM_SAFETYSTOCK_OMS;
    entity DCSet as select distinct site, StoreDescription from ss.ZMM_SAFETYSTOCK_OMS where fulfil = 'D';
    entity BOPISSet as select distinct site, StoreDescription from ss.ZMM_SAFETYSTOCK_OMS where fulfil = 'B';
    entity SFSSet as select distinct site, StoreDescription from ss.ZMM_SAFETYSTOCK_OMS where fulfil = 'S';
    entity StatusSet as projection on ss.Status;
    @cds.query.limit.max: 1000000000
    @cds.query.limit: 0
    // @restrict:[{
    //     grant: '*',
    //     to: 'ULTA_SS_SFS_MAINTAIN'
    // }, {
    //     grant: '*',
    //     to: 'ULTA_SS_BOPIS_MAINTAIN'
    // }, {
    //     grant: '*',
    //     to: 'ULTA_SS_DC_MAINTAIN'
    // }, {
    //     grant: '*',
    //     to: 'system-user'
    // }, {
    //     grant: '*',
    //     to: 'internal-user'
    // }]
    entity SafetyStockErrStageSet as projection on ss.ZMM_SAFETYSTOCK_ERRSTG;
    entity F4JobId as select distinct JobID from ss.ZMM_SAFETYSTOCK_ERRSTG;
    // entity F4JobId as projection on ss.ZMM_SAFETYSTOCK_ERRSTG;
   
    
    // @cds.persistence.skip
    // f4 valuehelp for SFS
    
    // entity A_Product as projection on external1.A_ProductPlant;
    entity ProductSet                  as projection on ss.articles;
    entity SiteSet                     as projection on ss.sites;

    @cds.persistence.skip
    @odata.singleton
    entity  ExcelUpload    {
        @Core.MediaType : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        excel : LargeBinary;
    };

    

    // Job to update deletion flag for invalid records...
    function fnUpdateExpiredStock() returns String;
    
    // Job to perform data purging for database tables...
    function fnDataPurge() returns String;

    action UpdateDCDetailsSet(DCSet: ss.UpdateDCDetails) returns ss.UpdateDCDetails;
    
}
