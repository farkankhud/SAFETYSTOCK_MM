const cds = require('@sap/cds')
const { PassThrough } = require('stream');
const XLSX = require('xlsx');
const DateT = require('date-and-time');
const { exit } = require('process');
const Moment = require('moment');
cds.env.features.fetch_csrf = true
module.exports = srv => {

  srv.on('PUT', "ExcelUpload", async (req, next) => {

    if (req.data.excel) {

      var entity = req.headers.slug;
      const stream = new PassThrough();
      var buffers = [];
      req.data.excel.pipe(stream);
      await new Promise((resolve, reject) => {
        stream.on('data', dataChunk => {
          buffers.push(dataChunk);
        });
        stream.on('end', async () => {
          var buffer = Buffer.concat(buffers);
          var workbook = XLSX.read(buffer, { type: "buffer", cellText: true, cellDates: true, dateNF: 'mm"/"dd"/"yyyy', cellNF: true, rawNumbers: false });
          let data = []
          //  Get jobid once so that for a particular run(upload) it does not change for the records
          const formattedTimestamp = getCurrentTimestampJobIdFormat();
          // for (let i = 0; i < sheets.length; i++) {
          let temp = XLSX.utils.sheet_to_json(
            workbook.Sheets[workbook.SheetNames[0]], { cellText: true, cellDates: true, dateNF: 'mm"/"dd"/"yyyy', rawNumbers: false, header: 0, defval: "" })

          temp.forEach((res, index) => {

            // ********* **********NEw additions Feb 12 2024*****************************
            res.createdby = req.user.id;
            res.createdat = getCurrentTimestampJobIdFormat1();
            const res1 = CreateNewJson(res, req, entity, formattedTimestamp);

            data.push(JSON.parse(JSON.stringify(res1)))

          });
          if (data) {

            // Push data inittially to errorstaging table
            try {
              const Errresponse = await UploadExcelData(req, data);
              const job = data[0].JOBID;
              resolve(req.notify({ message: job }));
              data = [];
              data = Errresponse;

            } catch (error) {
              return error.message;
            }


            // ******************Send data in batches of 1000 to the procedure InsertRecordsOriginal
            const batchSize = 1000;
            let data1 = [];
            data1 = data;
            const totalRecords = data1.length;
            const totalBatches = Math.ceil(totalRecords / batchSize);

            for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {

              let batch = data1.splice(0, batchSize);
              const responseCall = await CallEntity(entity, batch, req);
              batch = [];

              if (responseCall == -1 || responseCall == undefined)

                reject(req.error(400, {
                  message: 'Check the error log',
                  status: 400
                }));
              else {
                resolve(req.notify({
                  message: 'Upload Successful',
                  status: 200
                }));
              }

            }

          }


        });
      });
    } else {
      return next();
    }
  });

  async function CallEntity(entity, data1, req) {
    let data = [];
    let materials = [];
    let store_list1 = [];
    let totArray = [];
    let errmsg = '';
    let ProductDescription = [];


    // Extract articles and site from the data array extracted from excel
    for (const item of data1) {
      materials.push(item['ARTICLE'])
      store_list1.push(item['SITE'])
    }

    // **********************************Validation for DC****************************
    // Fetch Product Description from S4
    let article_service = await cds.connect.to('API_PRODUCT_SRV');
    ProductDescription = await article_service.run(SELECT`Product,ProductDescription`.from('A_ProductDescription').where`Product in ${materials}`);

    //   Fulfil_Method distinguishes the kind of data storage BOPIS 'B', SFS 'S' and DC 'D'
    if (data1[0].FULFIL == 'D') {

      // Send article site combination to S4 for validation
      totArray = await ValidateMaterialS4(data1, data1[0].FULFIL, req, cds, ProductDescription);



      // **********************************Post the error records in Staging Table**********************
      if (totArray != undefined) {
        if (totArray[0] != undefined && totArray[0].length > 0) {
          data = totArray[0];
        }
        if (totArray[1] != undefined && totArray[1].length > 0) {
          if (totArray[2] != '' || totArray[2] != undefined) {
            errmsg = totArray[2];
          }
          await postErrorRecords(totArray[1], errmsg, '');
        } else {
          if (totArray[0].length < 0) {
            return;
          }
        }
      } else {
        return;
      }


    }
    // else { // Send article site combination to ItemEligibility Master for validation
    //   totArray = await ValidateMaterialItemEligibility(data1, data1[0].FULFIL, req, cds, ProductDescription);
    //   if (totArray != undefined) {
    //     if (totArray[0] != undefined && totArray[0].length > 0) {
    //       data = totArray[0];

    //     }
    //     if (totArray[1] != undefined && totArray[1].length > 0) {
    //       if (totArray[2] != '' || totArray[2] != undefined) {
    //         errmsg = totArray[2];
    //       }
    //       await postErrorRecords(totArray[1], errmsg, 'MATERIAL');

    //     }


    //     else {
    //       if (totArray[0].length < 0) {
    //         return;
    //       }
    //     }
    //   }
    //   else {
    //     return;
    //   }


    // }


    // At this stage data cleansing is done, it is ready to be sent to db procedure for final cleansing and upload
    if (data.length > 0) {
      // A temp table with a dynamically generated name is created to map the array held in data
      const ltt = `#ltt_${cds.utils.uuid().replace(/-/g, '')}`
      await cds.run(`CREATE LOCAL TEMPORARY TABLE ${ltt} LIKE TTERROR`)
      await cds.run(`INSERT INTO ${ltt} VALUES ( ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, data.map(item => [
        item.JobID,
        item.SITE,
        item.ARTICLE,
        item.FULFIL,
        item.STATUS,
        item.VALIDFROM,
        item.VALIDTO,
        item.SFTYTOTPER,
        item.SFTYDCQTY,
        item.ERROR,
        item.ProductDescription

      ]));

      let user1 = req.user.id;
      const tmemptimestamp = getCurrentTimestamp();
      let jobid = tmemptimestamp + '-' + req.user.id;
      job = jobid;
      // Begin of change Mar 03, 2024
      // Fecth jobid from the runnin json
      jobid = data[0].JOBID;
      //End of change Mar 03, 2024
      // Procedure InsertDataAndLogErrors is called here with its parameters
      const query = `CALL INSERTDATAANDLOGERRORS(DATATOINSERT => ${ltt},USER => '${user1}',JOBID => '${jobid}',CREATED_AT => '${tmemptimestamp}')`

      data = await cds.run(query); // Change BESTSELLER to errorlog

      await cds.run(`DROP TABLE ${ltt}`)
      return job;
    } else {
      return
    }

  };

  function getCurrentTimestamp() {
    const sCurrentDate = new Date().toJSON().replace('T', ' ');
    const formattedTimestamp = sCurrentDate.replace('Z', ' ');

    return formattedTimestamp;
  }

  function getCurrentTimestampJobIdFormat() {
    const currentDate = new Date();
    const formattedTimestamp = DateT.format(currentDate, 'MM/DD/YYYY HH:mm:ss');
    return formattedTimestamp;
  }

  function getCurrentTimestampJobIdFormat1() {
    const currentDate = new Date();
    const formattedTimestamp = DateT.format(currentDate, 'YYYY-MM-DD HH:mm:ss');
    return formattedTimestamp;
  }

  function getTodaysDate() {
    const currentDate = new Date();
    const formattedTimestamp = DateT.format(currentDate, 'YYYY-MM-DD');

    return formattedTimestamp;
  }
  function getFormattedDate1(dateString) {
    try {
      let formattedDate;

      const date1 = new Date(dateString);
      return formattedDate = DateT.format(date1, 'MM/DD/YYYY');

    } catch (error) {

    }
  }
  function getFormattedDate(res) {
    try {
      let formattedFromDate;
      let formattedToDate;
      const fromdate = res["Valid Start date"];

      if (typeof (fromdate) != 'string') {
        formattedFromDate = DateT.format(fromdate, 'MM/DD/YYYY');
      } else {
        formattedFromDate = fromdate;
      }
      const todate = res["Valid End date"];

      if (typeof (todate) != 'string') {
        formattedToDate = DateT.format(todate, 'MM/DD/YYYY');
      } else {
        formattedToDate = todate;
      }

      let date = { "fromDate": '', "toDate": '' };
      return date = { "fromDate": formattedFromDate, "toDate": formattedToDate }
    } catch (error) {
      throw new Error(error.message);
    }

  }

  function checkDateValid(dateString) {
    // Regular expression to match the "YYYY-MM-DD" format
    const dateFormatRegex = /^\d{4}-\d{2}-\d{2}$/;

    // Check if the date string matches the desired format
    if (!dateFormatRegex.test(dateString)) {
      return false; // Date format is not valid
    }

    // Use Moment.js to validate the date

    return Moment(dateString, "YYYY-MM-DD", true).isValid();
  }

  // ***********************S4 Validation Store & Material for DC*************************
  async function ValidateMaterialS4(data, fulfil, req, cds, ProductDescription) {
    let materials = [];
    let store_list1 = [];
    let totArray = [];
    let fList_Valid = [];
    let errmsg;

    let offset = 0;
    let top = 5000;
    let result = [];


    let fList = [];
    for (const item of data) {
      materials.push(item['ARTICLE'])
      store_list1.push(item['SITE'])
    }
    // Removing duplicate records
    aUniqueMaterials = Array.from(new Set(materials));
    aUniqueStores = Array.from(new Set(store_list1));
    const stores = aUniqueStores.filter(e => e.length);

    try {
      let article_service = await cds.connect.to('API_PRODUCT_SRV');
      do {

        if (stores.length == 0) {
          // S4 call to API_PRODUCT_SRV->A_ProductPlant for article site validation when store is empty
          result = await article_service.run(SELECT`Product,Plant`.from('A_ProductPlant').limit(top, offset).where`Product in ${aUniqueMaterials}`);
        }
        else {
          // S4 call to API_PRODUCT_SRV->A_ProductPlant for article site validation when store is filled
          result = await article_service.run(SELECT`Product,Plant`.from('A_ProductPlant').limit(top, offset).where`Product in ${aUniqueMaterials} and Plant in ${aUniqueStores}`)
        }
        if (result.length > 0) {

          fList_Valid = fList_Valid.concat(result);
        }

        offset = offset + top;
      } while (result.length >= 5000);
    }
    catch (e) {
      totArray[1] = data;
      errmsg = "Issue in connecting with Remote service";
    }
    // Validate Stores returned to qualify for DC site category should be B
    fList_validStores = await ValidateStores(fList_Valid, data);
    if (fList_validStores) {
      if (fList_validStores[0] != undefined) {
        fList = fList_validStores[0]; //validated stores
      }
      else {
        errmsg = fList_validStores[1];
      }
    }

    if (fList.length != 0) {
      const set_B = new Set(fList.map(record => JSON.stringify({ ARTICLE: record.Product, SITE: record.Plant })));

      const errors = data.filter(itemA => {
        if (itemA.SITE !== '') {
          return !fList.some(itemB => itemB.Product == itemA.ARTICLE && itemB.Plant == itemA.SITE);
        } else {
          // Handle the case where itemA.site is blank, you may want to change this part based on your requirements.

          return !fList.some(itemB => itemB.Product == itemA.ARTICLE)
        }
      });
      const success = [];
      fList.forEach(recordB => {
        const key = JSON.stringify({ ARTICLE: recordB.Product, SITE: recordB.Plant });
        if (set_B.has(key)) {

          const matchingRecords = data.filter(recordA => {
            if (recordA.SITE !== '') {
              return recordA.ARTICLE === recordB.Product && recordA.SITE === recordB.Plant;
            } else {
              return recordA.ARTICLE == recordB.Product;
            }
          });
          // Process each matching record
          matchingRecords.forEach(existingRecord => {
            const newRecord = { ...existingRecord };
            const foundRecord = ProductDescription.find(recordP => recordP.Product == newRecord.ARTICLE);
            if (foundRecord) {
              newRecord.ProductDescription = foundRecord.ProductDescription;
            }
            if (existingRecord.SITE == '') {
              newRecord.SITE = recordB.Plant;
            }

            success.push(newRecord);
          });

          // Add the key to set_B
          set_B.add(key);
        }
      });

      totArray[0] = success;
      totArray[1] = errors;
      totArray[2] = errmsg;
      return totArray;
    } else {
      totArray[1] = data;
      totArray[2] = errmsg;
      return totArray;
    }

  }

  async function ValidateMaterialItemEligibility(data, fulfil, req, cds, ProductDescription) {
    let materials = [];
    let materialsTemp = [];
    let store_list1 = [];
    let totArray = [];
    let errmsg;
    let filteredArr;
    let offset = 0;
    let top = 5000;
    let result = [];
    let errors = [];
    let fList = [];
    let fList_Valid = [];
    let srv = await cds.connect.to('SafetyStockSrv');
    for (const item of data) {
      materialsTemp.push(item['ARTICLE'])
    }

    // Pad the materials with leading zeroes
    materials = PadMaterials(materialsTemp);

    for (const item of data) {
      store_list1.push(item['SITE'])
    }
    // Removing duplicate records
    aUniqueMaterials = Array.from(new Set(materials));
    aUniqueStores = Array.from(new Set(store_list1));
    const stores = PadStores(aUniqueStores);
    try {
      let article_service = await cds.connect.to('API_PRODUCT_SRV');
      do {

        if (stores.length == 0) {
          
          // Start of addition May 2 2024
          // For blank store file add  error message
          errmsg = 'Site is required in the upload file';
          break;
          // End of addition May 2 2024
        }
        else {
          // call to MARA/MAKT for article validation
          result = await article_service.run(SELECT`Product`.from('A_Product').limit(top, offset).where`Product in ${aUniqueMaterials}`);

        }
        if (result.length > 0) {
          fList_Valid = fList_Valid.concat(result);
        }
        offset = offset + top;
      } while (result.length >= 5000);
    }
    catch (e) {
      totArray[1] = data;
      errmsg = "Issue in connecting with Remote service";
    }
    
    // Distinguish BOPIS and SFS stores and validated them
    // Validate Stores returned to qualify for DC site category should be B
    if (fList_Valid) {
      //Compare against  stores and create a new array for BOPIS/SFS  with site & article
      filteredArr = data.filter(o1 => {
        return fList_Valid.some(o2 => {
          return o2.Product === o1.ARTICLE;
        });
      }).map(({ SITE, ARTICLE }) => ({ site: SITE, article: ARTICLE }));
      // This only filters out the invalid materials since the invalid stores will be posted to errostaging
      // from their respective functions ValidateStoresBOPIS and ValidateStoresSFS
      errors = data.filter(itemA => {
        if (itemA.SITE !== '') {
          return !filteredArr.some(itemB => itemB.article === itemA.ARTICLE && itemB.site === itemA.SITE);
        } else {
          // Handle the case where itemA.site is blank, you may want to change this part based on your requirements.
          return !fList.some(itemB => itemB.article == itemA.ARTICLE)
        }
      });

      if (fulfil == 'B') {

        // Error sites, whether non-existant or site category invalid for BOPIS and SFS, shall be updated in the
        // error staging table in their respective function calls ValidateStoresBOPIS and ValidateStoresSFS
        fList_validStores = await ValidateStoresBOPIS(filteredArr, data);
      } else {
        fList_validStores = await ValidateStoresSFS(filteredArr, data);
      }
    }

    // fList_validStores = await ValidateStores(fList_Valid, data);
    if (fList_validStores) {
      if (fList_validStores[0] != undefined) {
        fList_Stores = fList_validStores[0]; //validated stores
        fList = fList_Stores.map(item => {
          // End of new addition 16.03.2023
          const newArticle = Number(item.article).toString();
          // const newSite = Number(item.site).toString();
          return { ...item, article: newArticle };
        })
      }
      else {
        errmsg = fList_validStores[1];
      }
    }

    // End of new addition 16.03.2023


    if (fList.length != 0) {
      const set_B = new Set(fList.map(record => JSON.stringify({ ARTICLE: record.article, SITE: record.site })));
      const success = [];

      fList.forEach(recordB => {
        const key = JSON.stringify({ ARTICLE: recordB.article, SITE: recordB.site });
        if (set_B.has(key)) {

          // existingRecord = data.find(recordA => {
          const matchingRecords = data.filter(recordA => {
            if (recordA.site !== '') {
              return recordA.ARTICLE === recordB.article && recordA.SITE === recordB.site;
            }
            else {
              return recordA.article == recordB.ARTICLE;
            }
          });

          // if (existingRecord != undefined) {
          if (matchingRecords != undefined) {
            // Process each matching record
            matchingRecords.forEach(existingRecord => {
              const newRecord = { ...existingRecord };

              // New addition to get article description 21.02.2024
              const foundRecord = ProductDescription.find(recordP => recordP.Product == newRecord.ARTICLE);
              if (foundRecord) {
                newRecord.ProductDescription = foundRecord.ProductDescription;
              }
              // End of addition to get article description 21.02.2024

              if (existingRecord.SITE == '') {
                newRecord.SITE = recordB.site;
              }

              success.push(newRecord);
            });
          }

          set_B.add(key);

        }
      })

      totArray[0] = success;
      totArray[1] = errors;

      totArray[2] = errmsg;
      return totArray;
    } else {
      totArray[1] = errors;
      totArray[2] = errmsg;
      return totArray;

    }

  }

  function getDateFormat(res) {

    const fromdate = res.VALIDFROM;
    const todate = res.VALIDTO;
    // Format the date and time components
    let datecomp = fromdate.split('/');
    const formattedFromDate = `${datecomp[2]}-${datecomp[0]}-${datecomp[1]}`;
    datecomp = todate.split('/');
    const formattedToDate = `${datecomp[2]}-${datecomp[0]}-${datecomp[1]}`;
    return date = { "fromDate": formattedFromDate, "toDate": formattedToDate }
  }
  // ***********************************************End of calls****************
  /*START of StoreCodeSet read call*/
  srv.on('READ', 'StoreCodeSet', async (req) => {
    var service = await cds.connect.to('ZMM_VALIDATE_STORE_SRV');
    if (req._query && req._query.$filter) {
      const store_val = req._query.$filter.split("'")[1];

      stores = await service.run(SELECT`Store,StoreDescription`.from('StoreIdSet').where`Store = ${store_val} and SiteCategory = 'B'`);
      stores['$count'] = stores.length
      return stores;
    }
    else if (req._query && req._query.$search) {
      const store_val = req._query.$search.slice(1, -1).trim();
      stores = await service.run(SELECT`Store,StoreDescription`.from('StoreIdSet').where`Store = ${store_val} and SiteCategory = 'B'`);
      stores['$count'] = stores.length
      return stores;
    }
    else {
      stores = await service.run(SELECT`Store,StoreDescription`.from('StoreIdSet').where({ SiteCategory: 'B' }));
      stores['$count'] = stores.length
      return stores;
    }
  });
  /*END of StoreCodeSet read call*/

  /*START of MiaProductSet read call*/
  // srv.on('READ', 'AProductSet', async (req) => {
  //   var service = await cds.connect.to('ZMM_SKU_CONT_INQUIRY_SRV');
  //   if (req._query && req._query.$filter) {
  //     // const material_val = req._query.$filter.replace(/"/g, '').trim("'");
  //     const material_val = req._query.$filter.match(/'(\d+)'/)[1];
  //     material = await service.run(SELECT.from('SKU_ARTICLENUMBER_F4Set').where`ArticleNumber = ${material_val} and ArticleDesc =${material_val}`);
  //     material['$count'] = material.length
  //     return material;
  //   }
  //   else if (req._query && req._query.$search) {
  //     // const material_val = req._query.$search.replace(/"/g, '').trim("'");
  //     const material_val = req._query.$search.split("'")[1];
  //     material = await service.run(SELECT.from('SKU_ARTICLENUMBER_F4Set').where`ArticleNumber = ${material_val} and ArticleDesc =${material_val}`);
  //     material['$count'] = material.length
  //     return material;
  //   }
  //   else {
  //     material = await service.run(SELECT.from('SKU_ARTICLENUMBER_F4Set'));
  //     material['$count'] = material.length
  //     return material;
  //   }
  // })
  // /*END of MiaProductSet read call*/

  
  /*START of MiaProductSet read call*/
  // srv.on('READ', 'ProductSet', async (req) => {
  //   var service = await cds.connect.to('API_PRODUCT_SRV');
  //   if (req._query && req._query.$filter) {
  //     const products = req._query.$filter.split("'")[1];
  //     product = await service.run(SELECT`Product,ProductDescription`.from('A_ProductDescription').where({ Product: products }));
  //     product['$count'] = product.length;
  //     return product;
  //   }
  //   else if (req._query && req._query.$search) {
  //     const products = req._query.$search.slice(1, -1).trim();
  //     product = await service.run(SELECT`Product,ProductDescription`.from('A_ProductDescription').where({ Product: products }));
  //     product['$count'] = product.length;
  //     return product;
  //   }
  //   else {
  //     // product = await service.run(req.query);
  //     product = await service.run(SELECT`Product,ProductDescription`.from('A_ProductDescription'));
  //     product['$count'] = product.length;
  //     return product;
  //   }
  // })
  // Articleset
  srv.on('READ', 'ArticleSet', async (req) => {
    let product = [];
    if (req._query && req._query.$filter) {
      const products = req._query.$filter.split("'")[1];
      // Start of addition March 25 2024
      // Pad the materials with leading zeroes
      materials = PadMaterial(products);
      // End of addition March 25 2024

      const capmQuery = cds.ql.SELECT.distinct(['article', 'articleDescription']).from('SAFETYSTOCK_SYNITEM').where({ article: materials });
      product = await cds.tx(req).run(capmQuery);


      const resultTemp = product.map(item => {
        const newArticle = Number(item.article).toString();
        return { ...item, article: newArticle };
      })
      resultTemp.sort((a, b) => a - b);
      const result = removeDuplicates(resultTemp);
      result['$count'] = result.length;
      return result;
    }
    else if (req._query && req._query.$search) {
      const products = req._query.$search.slice(1, -1).trim();
      // Start of addition March 25 2024
      // Pad the materials with leading zeroes
      materials = PadMaterials(products);
      // End of addition March 25 2024
      const capmQuery = cds.ql.SELECT.distinct(['article', 'articleDescription']).from('SAFETYSTOCK_SYNITEM').where({ article: materials });
      product = await cds.tx(req).run(capmQuery);

      const resultTemp = product.map(item => {
        const newArticle = Number(item.article).toString();
        return { ...item, article: newArticle };
      })
      resultTemp.sort((a, b) => a - b);
      const result = removeDuplicates(resultTemp);
      result['$count'] = result.length;
      return result;
    }
    else {
      const capmQuery = cds.ql.SELECT.distinct(['article', 'articleDescription']).from('SAFETYSTOCK_SYNITEM');
      product = await cds.tx(req).run(capmQuery);

      const resultTemp = product.map(item => {
        const newArticle = Number(item.article).toString();
        return { ...item, article: newArticle };
      })
      resultTemp.sort((a, b) => a - b);
      const result = removeDuplicates(resultTemp);
      result['$count'] = result.length;
      return result;
    }
  })

  // srv.on('READ', 'SiteSet', async (req) => {

  //   var storeservice = await cds.connect.to('ZMM_VALIDATE_STORE_SRV');
  //   let product = [];
  //   let storeList = []
  //   let store_list1 = [];
  //   const sysDate = getTodaysDate();
  //   if (req._query && req._query.$filter) {
  //     const sites = req._query.$filter.split("'")[1];

  //     const capmQuery = cds.ql.SELECT.distinct`site`.from('SAFETYSTOCK_SYNSFS').where`site = ${sites} and SFSSiteEligibleFlag = 'Y' and 
  //     SFSSiteEligibleFlagValidTo >= ${sysDate}`;
  //     const site = await cds.tx(req).run(capmQuery);
  //     if (site.length > 0) {
  //       stores = await storeservice.run(SELECT`Store,StoreDescription`.from('StoreIdSet').where({ Store: sites }));
  //       if (stores.length > 0) {
  //         storeList = stores.map(({ Store: site, StoreDescription: StoreDescription }) => ({
  //           site, StoreDescription
  //         }));
  //       }


  //       storeList['$count'] = storeList.length;
  //       return storeList;
  //     }
  //   }
  //   else if (req._query && req._query.$search) {
  //     const products = req._query.$search.slice(1, -1).trim();

  //     const capmQuery = cds.ql.SELECT`site,article`.from('SAFETYSTOCK_SYNSFS').where({ article: products });
  //     product = await cds.tx(req).run(capmQuery);
  //     product['$count'] = product.length;
  //     return product;
  //   }
  //   else {
  //     // const sysDate = getTodaysDate();

  //     const capmQuery = cds.ql.SELECT.distinct`site`.from('SAFETYSTOCK_SYNSFS').where`SFSSiteEligibleFlag = 'Y' and 
  //     SFSSiteEligibleFlagValidTo >= ${sysDate}`;
  //     site = await cds.tx(req).run(capmQuery);

  //     if (site.length > 0) {
  //       for (const item of site) {
  //         store_list1.push(item['site'])
  //       }
  //       stores = await storeservice.run(SELECT`Store,StoreDescription`.from('StoreIdSet').where`Store in ${store_list1}`);
  //       if (stores.length > 0) {
  //         storeList = stores.map(({ Store: site, StoreDescription: StoreDescription }) => ({
  //           site, StoreDescription
  //         }));
  //       }
  //       storeList['$count'] = storeList.length;
  //       return storeList;
  //     }


     
  //   }
  // })



  async function postErrorRecords(data, errmsg, isErrorSiteMaterial) {
    entity = 'SAFETYSTOCKERRSTAGESET';
    collectQuery = [];
    let srv = await cds.connect.to('SafetyStockSrv');
    let date = { "fromDate": '', "toDate": '' }
    data.forEach(async (recordB) => {

      if (errmsg == '' || errmsg == undefined) {
        if (recordB.FULFIL == 'D') {
          recordB.ERROR = 'Article' + ' ' + recordB.ARTICLE + ' ' + 'with Store' + ' ' + recordB.SITE + ' ' + 'does not exists in S4 MARC Table';
        }
        else //For BOPIS and SFS
          if (isErrorSiteMaterial == 'MATERIAL') {
            recordB.ERROR = 'Article' + ' ' + recordB.ARTICLE + ' ' + 'does not exist in SAP Master Data';
          }
        if (isErrorSiteMaterial == 'SITECATEGORY') {
          recordB.ERROR = 'Store' + ' ' + recordB.SITE + ' ' + 'does not have a valid site Category';
        }
        if (isErrorSiteMaterial == 'SITE') {
          recordB.ERROR = 'Store' + ' ' + recordB.SITE + ' ' + 'is not available in SAP Master Data';
        }



      }
      else {
        recordB.ERROR = errmsg;
      }
      date = getDateFormat(recordB);
      recordB.VALIDFROM = date.fromDate;
      recordB.VALIDTO = date.toDate;


      // Update Records
      // Commented lines for upload
      const insertQuery = UPDATE(entity).set(recordB).where({ JOBID: recordB.JOBID, SITE: recordB.SITE, ARTICLE: recordB.ARTICLE, FULFIL: recordB.FULFIL });
      collectQuery = collectQuery.concat(insertQuery);
      //End of comment
    });
    // Commented lines for upload
    await srv.run(collectQuery);
    //End of comment

  }

  srv.after('READ', 'SafetyStockMasterSet', async (req, res) => {
    if (res.results.length > 0) {
      if (req[0].$count == undefined) {


        let store_list = [];
        if (res.results.length > 0) {
          // Fetch the store decription
          for (const item of res.results) {
            store_list.push(item['site'])
          }
          var storeservice = await cds.connect.to('ZMM_VALIDATE_STORE_SRV');
          stores = await storeservice.run(SELECT`Store,StoreDescription`.from('StoreIdSet').where`Store in ${store_list}`);

          // Accommodate store description in the array
          if (res.results.length > 0) {
            res.results['$count'] = res.results.length;
          }

          for (let i = 0; i < res.results.length; i++) {
            let elementA = res.results[i];
            // Find corresponding element in arrayB
            let elementB = stores.find(item => item.Store === elementA.site);
            if (elementB) {
              // Update value in arrayA
              elementA.StoreDescription = elementB.StoreDescription;
            }
          }

        }

      }
    }
  });

  srv.after('READ', 'BOPISSet', _fnDisplaySiteF4);
  srv.after('READ', 'DCSet', _fnDisplaySiteF4);
  srv.after('READ', 'SFSSet', _fnDisplaySiteF4);

  srv.on('CREATE', 'SafetyStockMasterSet', async (req, res) => {

    let errmsg;
    entity = 'SAFETYSTOCKMASTERSET';
    req.data.createdat = getCurrentTimestamp();
    req.data.modifiedat = getCurrentTimestamp();
    req.data.createdby = req.user.id;
    req.data.modifiedby = req.user.id;
    try {

      let srv = await cds.connect.to('SafetyStockSrv');
      const { SafetyStockMasterSet } = srv.entities;
      // Check for overlapping records much before inserting

      const overlapRecord = await SELECT`article,validFrom,validTo`.from(SafetyStockMasterSet).where({
        article: req.data.article,
        site: req.data.site,
        fulfil: req.data.fulfil
      });
      if (overlapRecord.article == '') {
        errmsg = await createRecord(req, res);
        if (errmsg) {
          return req.error({ code: "400", message: errmsg });
        }
        else {
          return req.data
        }
      }
      else {

        const lookupRecord = overlapRecord.filter(item => (req.data.validFrom >= item.validFrom && req.data.validFrom <= item.validTo) ||
          (req.data.validTo >= item.validFrom && req.data.validTo <= item.validTo) ||
          (req.data.validFrom <= item.validFrom && req.data.validTo >= item.validTo));
        if (lookupRecord.length > 0) {
          if (req.data.fulfil === "D")
            errmsg = 'Overlapping record exists with Article ' + req.data.article + ' with DC ' + req.data.site + '.';
          else if (req.data.fulfil === "B" || req.data.fulfil === "S")
            errmsg = 'Overlapping record exists with Article ' + req.data.article + ' with store ' + req.data.site + '.';

          if (errmsg) {
            return req.error({ code: "400", message: errmsg });
          }
          else {
            return req.data
          }
        }
        else {
          errmsg = await createRecord(req, res);
          if (errmsg) {
            return req.error({ code: "400", message: errmsg });
          }
          else {

            return req.data
          }
        }
      }

    } catch (error) {

      if (error.message == '' || error.message == undefined) {
        errmsg = "Issue in connecting with Remote service";
        error.message = "Issue in connecting with Remote service";
      }
      return req.error({ code: "400", message: errmsg });

    }

  })


  function CreateNewJson(res, req, entity, formattedTimestamp) {
    // Entity here carries the fulfil value as coming from slug parameter
    let store = [];
    if (entity == 'B' || entity == 'S') {
      res.Quantity = 0;
    }
    else {
      res.Percentage = 0;
    }

    if (res.Site == '') {
      store[0] = res.Site
    } else {
      store = PadStore(res.Site);
    }
    const date = getFormattedDate(res);
    res.JOBID = req.user.id + '_' + formattedTimestamp;
    res.ERROR = '';
    res.STATUS_STATUSID = 'U';
    let newJson = {
      "JOBID": res.JOBID,
      "CREATEDBY": res.createdby,
      "CREATEDAT": res.createdat,
      "SITE": store[0],
      "ARTICLE": res.Article.trim(),
      "FULFIL": entity,
      "STATUS": res.STATUS_STATUSID,
      "VALIDFROM": date.fromDate,//res["Valid Start date"],
      "VALIDTO": date.toDate,//res["Valid End date"],
      "SFTYDCQTY": res.Quantity,
      "SFTYTOTPER": res.Percentage,
      "ERROR": res.ERROR
    }
    return newJson;
  }

  async function ValidateStores(Storelist, data) {
    if (Storelist.length > 0) {

      let errmsg;
      let totArray = [];

      let store_list1 = [];
      for (const item of Storelist) {
        store_list1.push(item['Plant'])
      }
      aUniqueStores = Array.from(new Set(store_list1));
      try {
        let service = await cds.connect.to('ZMM_VALIDATE_STORE_SRV');
        storesValidated = await service.run(SELECT.from('StoreIdSet').where`Store in ${aUniqueStores}`);

        if (storesValidated.length > 0) {

          const success = [];
          totArray[0] = success;
          totArray[1] = errmsg;
          //Compare against site category = 'B' and stores and create a new array      
          let filteredArr = Storelist.filter(o1 => {
            return storesValidated.some(o2 => {
              return o2.SiteCategory === 'B' && o2.Store === o1.Plant;
            });
          }).map(({ Plant, Product }) => ({ Plant: Plant, Product: Product }));

          totArray[0] = filteredArr;;
          totArray[1] = errmsg;
          return totArray;

        }
        else {
          totArray[0] = data;
          totArray[1] = errmsg;
          return totArray;
        }
      }
      catch (e) {
        totArray[1] = "Issue in connecting with Remote service";
        return totArray;
      }
    }
  }

  // Validate BOPIS
  async function ValidateStoresBOPIS(Storelist, data) {
    if (Storelist.length > 0) {
      let errmsg;
      let totArray = [];
      let erroStagingdArr = [];
      let erroStagingdArr1 = [];
      let store_list1 = [];
      for (const item of Storelist) {
        store_list1.push(item['site'])
      }
      aUniqueStores = Array.from(new Set(store_list1));
      try {
        let service = await cds.connect.to('ZMM_VALIDATE_STORE_SRV');
        storesValidated = await service.run(SELECT.from('StoreIdSet').where`Store in ${aUniqueStores}`);

        if (storesValidated.length > 0) {
          // Prepare a errorstaging array
          erroStagingdArrSites = arrangeErrorStaging(data, Storelist);
          // *Start of Change May 06 2024
          // Get the error sites from storesValidated which are not found in S4
          // Get a new list of error array
          erroStagingdArr1 = ErrorStagingArraySite(Storelist, storesValidated)

          // Create a new array according to errorstaging table with Storelist
          if (erroStagingdArr1.length > 0) {
            erroStagingdArr = arrangeErrorStaging(erroStagingdArrSites, erroStagingdArr1);

            await postErrorRecords(erroStagingdArr, errmsg, 'SITE');

          }
          // *End of Change of Change May 06 2024
          //Compare against site category = 'A' and stores and create a new array with site qualification 
          let filteredArr = Storelist.filter(o1 => {
            return storesValidated.some(o2 => {

              return o2.SiteCategory === 'A' && o2.Store === o1.site;
            });
          }).map(({ site, article }) => ({ site: site, article: article }));
          //Start of new addition May 03, 2024

          // Pass the errorrecords to errorstaging
          // Get the error list for sites which are present in S4 but do not have a valid site category
          erroStagingdArr1 = ErrorStagingArraySiteCategory(storesValidated, filteredArr);
          // Create a new array according to errorstaging table with Storelist
          if (erroStagingdArr1.length > 0) {
            erroStagingdArr = arrangeErrorStagingSiteCategory(erroStagingdArrSites, erroStagingdArr1);
            await postErrorRecords(erroStagingdArr, errmsg, 'SITECATEGORY');

          }
          //End of new addition   May 03, 2024
          totArray[0] = filteredArr;//success;
          totArray[1] = errmsg;
          return totArray;

        }
        else {    //No Stores found
          totArray[0] = [];
          erroStagingdArr = arrangeErrorStaging(data, Storelist);
          await postErrorRecords(erroStagingdArr, errmsg, 'SITE');
          totArray[1] = errmsg;
          return totArray;
        }
      }
      catch (e) {
        totArray[1] = "Issue in connecting with Remote service";
        return totArray;
      }
    }
  }

  // Validate SFS Stores
  async function ValidateStoresSFS(Storelist, data) {
    let srv = await cds.connect.to('SafetyStockSrv');
    if (Storelist.length > 0) {
      let errmsg;
      let totArray = [];
      let erroStagingdArr = [];
      let erroStagingdArr1 = [];
      let store_list1 = [];
      for (const item of Storelist) {
        store_list1.push(item['site'])
      }

      try {
        const sysDate = getTodaysDate();
        storesValidated = await srv.run(SELECT.from('SFS_eligibility').where`site in ${store_list1} and SFSSiteEligibleFlag = 'Y' and SFSSiteEligibleFlagValidTo >= ${sysDate}`);
        if (storesValidated.length > 0) {
          // Prepare a errorstaging array
          erroStagingdArrSites = arrangeErrorStaging(data, Storelist);

          // Get the error sites from storesValidated which are not found in S4
          // Get a new list of error array
          erroStagingdArr1 = ErrorStagingArraySiteSFS(Storelist, storesValidated)

          // Create a new array according to errorstaging table with Storelist
          if (erroStagingdArr1.length > 0) {
            erroStagingdArr = arrangeErrorStaging(erroStagingdArrSites, erroStagingdArr1);

            await postErrorRecords(erroStagingdArr, errmsg, 'SITE');

          }
          const success = [];
          totArray[0] = success;
          totArray[1] = errmsg;
          //Compare against  stores and create a new array  
          let filteredArr = Storelist.filter(o1 => {
            return storesValidated.some(o2 => {
              return o2.site === o1.site;
            });
          }).map(({ site, article }) => ({ site: site, article: article }));
          //Start of new addition May 03, 2024

          // Pass the errorrecords to errorstaging
          // Get the error list for sites which are present in S4 but do not have a valid site category
          erroStagingdArr1 = ErrorStagingArraySiteCategorySFS(storesValidated, filteredArr);
          // Create a new array according to errorstaging table with Storelist
          if (erroStagingdArr1.length > 0) {
            erroStagingdArr = arrangeErrorStagingSiteCategory(erroStagingdArrSites, erroStagingdArr1);
            await postErrorRecords(erroStagingdArr, errmsg, 'SITECATEGORY');

          }
          //End of new addition   May 03, 2024
          totArray[0] = filteredArr;//success;
          totArray[1] = errmsg;
          return totArray;

        }
        else {  //No Stores found
          //Start of new addition May 03, 2024
          // totArray[0] = data;
          totArray[0] = [];
          erroStagingdArr = arrangeErrorStaging(data, Storelist);
          await postErrorRecords(erroStagingdArr, errmsg, 'SITE');
          //End of new addition   May 03, 2024

          totArray[1] = errmsg;
          return totArray;
        }
      } catch (error) {

      }
    }
  }

  function PadMaterials(numbers) {
    return numbers.map(num => num.toString().padStart(18, '0'));
  }

  function PadMaterial(number) {
    return [number.toString().padStart(18, '0')];
  }

  function PadStores(numbers) {
    return numbers.map(num => num.toString().padStart(4, '0'));
  }

  function PadStore(number) {
    return [number.toString().padStart(4, '0')];
  }

  // // Function to process Excel extracted data to Error Staging Table
  async function UploadExcelData(req, excelData) {
    try {
      const sysDate = getTodaysDate();
      let result = [];
      let isDateValid;
      result = excelData;
      let date = { "fromDate": '', "toDate": '' }

      let new_list = result.map(function (obj) {
        date = getDateFormat(obj);
        // Validate Start and End Dates
        isDateValid = checkDateValid(date.fromDate);
        formatMessage = '';
        if (isDateValid == false) {
          formatMessage = 'Date Format is incorrect for Valid Start Date';
          date.fromDate = obj.VALIDFROM;
        }
        else {
          formatMessage = '';
        }

        // Validate the format for End date
        isDateValid = checkDateValid(date.toDate);

        if (isDateValid == false) {
          if (!formatMessage) {
            formatMessage = 'Date Format is incorrect for Valid End Date';
            date.toDate = obj.VALIDTO;
          } else {
            formatMessage = 'Date Format is incorrect for Valid Start Date and Valid End Date';
            date.toDate = obj.VALIDTO;
          }

        }
        else {
          if (!formatMessage) {
            formatMessage = '';
          }

        }
        // End of Vaidation
        return {

          JobID: obj.JOBID,
          createdBy: obj.CREATEDBY,
          createdAt: obj.CREATEDAT,
          site: obj.SITE,
          article: obj.ARTICLE,
          fulfil: obj.FULFIL,
          status: 'U',
          validFrom: date.fromDate,
          validTo: date.toDate,
          sftyTotPer: obj.SFTYTOTPER,
          sftyDcQty: obj.SFTYDCQTY,

          error: formatMessage,
          createDate: sysDate


        }
      });

      const entity = 'SAFETYSTOCKERRSTAGESET';
      const insertQuery = INSERT.into(entity).entries(new_list);
      await srv.run(insertQuery);
      // return await filterBlankProperty(new_list, 'error')
      const successArray = excelData.filter(o1 => {
        return new_list.some(o2 => {
          return o1.SITE === o2.site && o1.ARTICLE === o2.article && o1.VALIDFROM === getFormattedDate1(o2.validFrom)
            && o1.VALIDTO === getFormattedDate1(o2.validTo) && o2.error === '';
        })
      });
      return successArray;
    } catch (error) {
      return req.error(error.message);
    }

  }

  // Create Record Function
  async function createRecord(req, res) {

    let product = [];
    let result = [];
    let store;
    let errmsg;
    entity = 'SAFETYSTOCKMASTERSET';
    req.data.createdat = getCurrentTimestamp();
    req.data.modifiedat = getCurrentTimestamp();
    req.data.createdby = req.user.id;
    req.data.modifiedby = req.user.id;
    try {

      let srv = await cds.connect.to('SafetyStockSrv');
      // Check for overlapping records much before inserting

      // Fetch the product description irrespective of fulfilment type
      // Pad the article with leading zeroes
      article = PadMaterial(req.data.article);
      // if (req.data.fulfil == 'D') {
      var service = await cds.connect.to('API_PRODUCT_SRV');
      product = await service.run(SELECT`Product,ProductDescription`.from('A_ProductDescription').limit(1, 0).where({ Product: req.data.article }));
      if (product) {
        req.data.artDesc = product[0].ProductDescription;
      }

      // Populate store description before pushing the data
      let article_service = await cds.connect.to('API_PRODUCT_SRV');
      if (req.data.fulfil == 'D') {
        req.data.siteCategory = 'B';
        req.data.sftyBopPer = 0;
        req.data.status = 'A';
        if (req.data.IsFlagEditTrue == '' || req.data.IsFlagEditTrue == null) {
          req.data.IsFlagEditTrue = false;
        }
        // let article_service = await cds.connect.to('API_PRODUCT_SRV');
        result = await article_service.run(SELECT`Product,Plant`.from('A_ProductPlant').where`Product = ${req.data.article} and Plant = ${req.data.site}`);


        if (result.length == 0) {

          errmsg = 'Article' + ' ' + req.data.article + ' ' + 'with DC' + '  ' + req.data.site + ' ' + 'does not exists in MARC table';
          return errmsg;
        } else {
          const insertQuery = INSERT.into(entity).entries(req.data);
          insertResult = await srv.run(insertQuery);
        }

      } else { //SFS/BOPIS Data
        req.data.siteCategory = 'A';
        req.data.status = 'A';
        if (req.data.IsFlagEditTrue == '' || req.data.IsFlagEditTrue == null) {
          req.data.IsFlagEditTrue = false;
        }
        // Pad the stores with leading zeroes
        if (req.data.site != '') {
          store = PadStore(req.data.site);
        }
        const newArticle = Number(req.data.article).toString();
        req.data.article = newArticle;
        const insertQuery = INSERT.into(entity).entries(req.data);
        insertResult = await srv.run(insertQuery);

      }

    } catch (error) {

      if (error.message == '' || error.message == undefined) {
        errmsg = "Issue in connecting with Remote service";

      }
      else {
        errmsg = error.message;
      }
      return errmsg

    }
  }

  // Function to remove duplicates based on material and description
  function removeDuplicates(arr) {
    const uniqueArticles = {};
    const result = [];

    for (const obj of arr) {
      if (!uniqueArticles[obj.article]) {
        result.push(obj);
        uniqueArticles[obj.article] = true;
      }
    }

    return result;
  }
  // Function to remove duplicates based on a specific property
  function removeDuplicates(array, property) {
    return array.filter((item, index, self) =>
      index === self.findIndex((t) => (
        t[property] === item[property]
      ))
    );
  }
  function FilterErrors(array1, array2) {
    return array1.filter(itemA => {
      if (itemA.SITE !== '') {
        // return !array2.some(itemB => itemB.article === itemA.ARTICLE && itemB.site === itemA.SITE);
        return !array2.some(itemB => itemB.article === itemA.article && itemB.site === itemA.site);
      } else {
        // Handle the case where itemA.site is blank, you may want to change this part based on your requirements.
        return !array2.some(itemB => itemB.article == itemA.ARTICLE)
      }
    });
  }
  function ErrorStagingArraySite(array1, array2) {
    return array1.filter(o1 => {
      return !array2.some(o2 => {
        // return !filteredArr.some(itemB => itemB.article === itemA.ARTICLE && itemB.site === itemA.SITE);
        // return o2.article === o1.article && o2.site === o1.site;
        return o2.Store === o1.site;
        // (itemB => itemB.article === itemA.ARTICLE && itemB.site === itemA.SITE)
      });
    })
  }
  function ErrorStagingArraySiteSFS(array1, array2) {
    return array1.filter(o1 => {
      return !array2.some(o2 => {
        // return !filteredArr.some(itemB => itemB.article === itemA.ARTICLE && itemB.site === itemA.SITE);
        // return o2.article === o1.article && o2.site === o1.site;
        return o2.site === o1.site;
        // (itemB => itemB.article === itemA.ARTICLE && itemB.site === itemA.SITE)
      });
    })
  }
  function ErrorStagingArraySiteCategory(array1, array2) {
    return array1.filter(o1 => {
      return !array2.some(o2 => {
        // return !filteredArr.some(itemB => itemB.article === itemA.ARTICLE && itemB.site === itemA.SITE);
        // return o2.article === o1.article && o2.site === o1.site;
        return o2.site === o1.Store;
        // (itemB => itemB.article === itemA.ARTICLE && itemB.site === itemA.SITE)
      });
    })
  }

  function ErrorStagingArraySiteCategorySFS(array1, array2) {
    return array1.filter(o1 => {
      return !array2.some(o2 => {
        // return !filteredArr.some(itemB => itemB.article === itemA.ARTICLE && itemB.site === itemA.SITE);
        // return o2.article === o1.article && o2.site === o1.site;
        return o2.site === o1.site;
        // (itemB => itemB.article === itemA.ARTICLE && itemB.site === itemA.SITE)
      });
    })
  }

  function arrangeErrorStaging(array1, array2) {
    return array1.filter(o1 => {
      return array2.some(o2 => {

        return o2.article === o1.ARTICLE && o2.site === o1.SITE;
        // (itemB => itemB.article === itemA.ARTICLE && itemB.site === itemA.SITE)
      });
    })
  }
  function arrangeErrorStagingSiteCategory(array1, array2) {
    return array1.filter(o1 => {
      return array2.some(o2 => {

        return o2.Store === o1.SITE;
        // (itemB => itemB.article === itemA.ARTICLE && itemB.site === itemA.SITE)
      });
    })
  }
  // Update Staus of SafteyStock Master to 'D' for expired stock
  srv.on("fnUpdateExpiredStock", async (req) => {

    try {
      const todaysDate = getTodaysDate();
      const formattedTimestamp = getCurrentTimestamp();
      const modifiedUser = req.user.id;
      entity = 'SAFETYSTOCKMASTERSET';
      let srv = await cds.connect.to('SafetyStockSrv');
      const insertQuery = UPDATE(entity).set({ "status": "D", "ModifiedAt": formattedTimestamp, "ModifiedBy": modifiedUser }).where`validTo < ${todaysDate} and status != 'D'`;
      await srv.run(insertQuery);
      return "Records with valid to date less than system date are marked as D.";
    } catch (error) {

      return req.error({ code: "400", message: "Error in updating the records." });
    }

  });

  /**
   * function to perform data purging
   * SAFETYSTOCKMASTERSET - Retention perriod: 1 Year
   * SAFETYSTOCKERRSTAGESET - Retention Period: 1 Month
   */
  srv.on("fnDataPurge", async (req) => {

    try {
      // Get today's date
      var today = new Date();

      // Subtract 365 days
      var yearAgo = new Date(today);
      yearAgo.setDate(today.getDate() - 365);

      // Format the date as YYYY-MM-DD
      var formattedDate = yearAgo.toISOString().split('T')[0];

      entity = 'SAFETYSTOCKMASTERSET';
      let srv = await cds.connect.to('SafetyStockSrv');
      // Checking if records exists for the criteria...
      aStage = await srv.run(SELECT.from`SAFETYSTOCKMASTERSET`.where`validTo < ${formattedDate}`);
      if (aStage.length > 0) {
        const insertQuery = DELETE(entity).where`validTo < ${formattedDate}`;
        await srv.run(insertQuery);
      }

      // Subtract 30 days
      var thirtyDaysAgo = new Date(today);
      thirtyDaysAgo.setDate(today.getDate() - 30);

      // Format the date as YYYY-MM-DD
      formattedDate = thirtyDaysAgo.toISOString().split('T')[0];
      entity = 'SAFETYSTOCKERRSTAGESET';

      // Checking if records exists for the criteria...
      aStage = await srv.run(SELECT.from`SAFETYSTOCKERRSTAGESET`.where`createDate < ${formattedDate}`);
      if (aStage.length > 0) {
        const insertQuery = DELETE(entity).where`createDate < ${formattedDate}`;
        await srv.run(insertQuery);
      }

      return "Records removed successfully.";
    } catch (error) {
      return req.error({ code: "400", message: "Error in updating the records." });
    }

  });

  srv.on('UpdateDCDetailsSet', async (req) => {
    var aDCData = req.data.DCSet,
      sEntity = 'SAFETYSTOCKMASTERSET',
      aArticle = [], aSite = [], sD = "D", sA = "A", aValidFrom = [];
    aMasterData = [], oMasterData = {},
      aCollectQuery = [], aCollectInsertQuery = [],
      dToday = new Date(), dFrom = new Date(), dTo = new Date(),
      sDateTimeStamp = getCurrentTimestamp(),
      sUser = req.user.id;

    // Preparing where clause for select query
    aDCData.forEach(async (oItem) => {
      aArticle.push(oItem.article);
      aSite.push(oItem.site);
      aValidFrom.push(oItem.validFrom);
    });
    // Reading existing data from table...
    aMasterData = await srv.run(SELECT.from(sEntity).where`site in ${aSite} and article in ${aArticle} and fulfil = ${sD} and validFrom in ${aValidFrom}`);

    // Preparing Update queries to be run...
    aDCData.forEach(async (oItem) => {
      // Reading existing records...
      oMasterData = aMasterData.find((oElement) => oElement.SITE == oItem.site && oElement.ARTICLE == oItem.article && oElement.VALIDFROM == oItem.validFrom);

      // Getting ValidFrom Date...
      dFrom.setDate(oMasterData.VALIDFROM.substr(8, 2));
      dFrom.setMonth(oMasterData.VALIDFROM.substr(5, 2) - 1);
      dFrom.setYear(oMasterData.VALIDFROM.substr(0, 4));
      // Getting ValidTo Date...
      dTo.setDate(oMasterData.VALIDTO.substr(8, 2));
      dTo.setMonth(oMasterData.VALIDTO.substr(5, 2) - 1);
      dTo.setYear(oMasterData.VALIDTO.substr(0, 4));

      if (dFrom >= dToday) {
        // if article is valid in future --> update as is...
        let sQuery = UPDATE(sEntity).set({
          MODIFIEDBY: sUser,
          MODIFIEDAT: sDateTimeStamp,
          VALIDTO: oItem.validTo,
          SFTYDCQTY: oItem.sftyDcQty,
          STATUS: sA
        }).where({
          SITE: oItem.site,
          ARTICLE: oItem.article,
          FULFIL: sD,
          VALIDFROM: oItem.validFrom
        });
        aCollectQuery = aCollectQuery.concat(sQuery);
      } else if (dFrom <= dToday && dTo >= dToday) {
        // if article is valid --> split in 2 records...
        // 1. Till yesterday with delete status 
        let dYesterday = new Date();
        dYesterday.setDate(dToday.getDate() - 1);

        let sQuery = UPDATE(sEntity).set({
          MODIFIEDBY: sUser,
          MODIFIEDAT: sDateTimeStamp,
          VALIDTO: dYesterday.toJSON().split("T")[0],
          STATUS: sD
        }).where({
          SITE: oItem.site,
          ARTICLE: oItem.article,
          FULFIL: sD,
          VALIDFROM: oItem.validFrom
        });
        aCollectQuery = aCollectQuery.concat(sQuery);

        // 2. Insert new entry from today with active status
        oMasterData.CREATEDAT = sDateTimeStamp;
        oMasterData.CREATEDBY = sUser;
        oMasterData.MODIFIEDAT = sDateTimeStamp;
        oMasterData.MODIFIEDBY = sUser;
        oMasterData.VALIDFROM = dToday.toJSON().split("T")[0];
        oMasterData.VALIDTO = oItem.validTo;
        oMasterData.SFTYDCQTY = oItem.sftyDcQty;
        oMasterData.STATUS = sA;

        const sInsertQuery = INSERT.into(sEntity).entries(oMasterData);
        aCollectInsertQuery = aCollectInsertQuery.concat(sInsertQuery);
      } else if (dFrom < dToday && dTo < dToday) {
        // if article is invalid --> skip the record
      }
    });

    // Executing collected queries...
    try {
      if (aCollectQuery.length > 0)
        await srv.run(aCollectQuery);

      if (aCollectInsertQuery.length > 0)
        insertResult = await srv.run(aCollectInsertQuery);
    } catch (error) {
      aDCData.forEach((oItem) => {
        oItem.status = "E";
        oItem.message = "Error in updating record(s)";
      });
      return aDCData;
    }

    aDCData.forEach((oItem) => {
      oItem.status = "S";
      oItem.message = "Record(s) update successfully";
    });
    return aDCData;
  });
}

async function _fnDisplaySiteF4(req, res) {
  if (res.results.length > 0) {
    if (req[0].$count == undefined) {
      let store_list = [];
      if (res.results.length > 0) {
        // Fetch the store decription
        for (const item of res.results) {
          store_list.push(item['site'])
        }
        var storeservice = await cds.connect.to('ZMM_VALIDATE_STORE_SRV');
        stores = await storeservice.run(SELECT`Store,StoreDescription`.from('StoreIdSet').where`Store in ${store_list}`);

        // Accommodate store description in the array
        if (res.results.length > 0) {
          res.results['$count'] = res.results.length;
        }

        for (let i = 0; i < res.results.length; i++) {
          let elementA = res.results[i];
          // Find corresponding element in arrayB
          let elementB = stores.find(item => item.Store === elementA.site);
          if (elementB) {
            // Update value in arrayA
            elementA.StoreDescription = elementB.StoreDescription;
          }
        }
      }
    }
  }

}