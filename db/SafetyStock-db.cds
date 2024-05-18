namespace safetystock;

using {managed} from '@sap/cds/common';


entity ZMM_SAFETYSTOCK_OMS : managed {
    key site             : String(4);
    key article          : String(18);
    key fulfil           : String(1);
    key validFrom        : Date;
        validTo          : Date;
        siteCategory     : String(1);
        status           : String(1);
        artDesc          : String(40);
        sftyBopPer       : Integer;
        sftySfsPer       : Integer;
        sftyTotPer       : Integer;
        sftyDcQty        : Decimal(13, 3);
        StoreDescription : String(40);
        IsFlagEditTrue   : Boolean;
}

entity Status {
    key statusId   : String(1);
        StatusDesc : String(40);
}

entity articles {
   
   
   key  article    : String(18);
    articleDesc: String(40);
    
}

entity sites {
    key site       : String(4);
    siteDesc    : String(40);
}

entity ZMM_SAFETYSTOCK_ERRSTG {
    JobID      : String(200);
    createdBy : String(255);
    createdAt : Timestamp;
    site       : String(4);
    article    : String(18);
    fulfil     : String(1);
    status     : String(1);
    validFrom  : String(10);//Date;
    validTo    : String(10);//Date;
    sftyTotPer : Integer;
    sftyDcQty  : Decimal(13, 3);
    error      : String(5000);
    createDate : Date;
}

type StrDCSafety    : many {
    site             : String(4);
    article          : String(18);
    fulfilmentMethod : String(1);
    siteCategory     : String(1);
    validFrom        : Date;
    validTo          : Date;
    status           : String(1);
    dcStock          : Decimal(9, 2);
}

type StrStoreSafety : many {
    site             : String(4);
    article          : String(18);
    fulfilmentMethod : String(1);
    siteCategory     : String(1);
    validFrom        : Date;
    validTo          : Date;
    status           : String(1);
    ssStockTotalPer  : Decimal(9, 2);
}



type UpdateDCDetails: many {
    site: String(4);
    article: String(18);
    fulfil: String(1);
    validFrom: Date;
    validTo: Date;
    sftyDcQty: Decimal(13, 3);
    status: String(1);
    message: String(40);
}