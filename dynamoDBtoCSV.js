var program = require("commander");
var AWS = require("aws-sdk");
var unmarshalItem = require("dynamodb-marshaler").unmarshalItem;
var unmarshal = require("dynamodb-marshaler").unmarshal;
var Papa = require("papaparse");
var fs = require("fs");
var headers = [];
var unMarshalledArray = [];

program
  .version("0.0.1")
  .option("-t, --table [tablename]", "Add the table you want to output to csv")
  .option("-d, --describe")
  .option("-j, --json", "Save output into json files, this will ignore -f")
  .option("-r, --region [regionname]")
  .option(
    "-e, --endpoint [url]",
    "Endpoint URL, can be used to dump from local DynamoDB"
  )
  .option("-p, --profile [profile]", "Use profile from your credentials file")
  .option("-m, --mfa [mfacode]", "Add an MFA code to access profiles that require mfa.")
  .option("-f, --file [file]", "Name of the file to be created")
  .option(
    "-ec --envcreds",
    "Load AWS Credentials using AWS Credential Provider Chain"
  )
  .option("-s, --size [size]", "Number of lines to read before writing.", 5000)
  .option("--page-Size [pageSize]", "Pagination, this is page size. We will make a query for each page, page size is also the number of lines to read in each query.", 1)
  .option("--cooldown-before-query [cooldownBeforeQuery]", "Cooldown time between queries in ms.", 1 *1000)
  .option("--speed-up-by [speedUpBy]", "To slowly warm up the auto scaling, increase the page size every query by this number.", 1)
  .parse(process.argv);

if (!program.table) {
  console.log("You must specify a table");
  program.outputHelp();
  process.exit(1);
}

if (program.region && AWS.config.credentials) {
  AWS.config.update({ region: program.region });
} else {
  AWS.config.loadFromPath(__dirname + "/config.json");
}

if (program.endpoint) {
  AWS.config.update({ endpoint: program.endpoint });
}

if (program.profile) {
  var newCreds = new AWS.SharedIniFileCredentials({ profile: program.profile });
  newCreds.profile = program.profile;
  AWS.config.update({ credentials: newCreds });
}

if (program.envcreds) {
  var newCreds = AWS.config.credentials;
  newCreds.profile = program.profile;
  AWS.config.update({
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    },
    region: process.env.AWS_DEFAULT_REGION
  });
}

if (program.mfa && program.profile) {
  const creds = new AWS.SharedIniFileCredentials({
    tokenCodeFn: (serial, cb) => {cb(null, program.mfa)},
    profile: program.profile
  });

  // Update config to include MFA
  AWS.config.update({ credentials: creds });
} else if(program.mfa && !program.profile) {
  console.log('error: MFA requires a profile(-p [profile]) to work');
  process.exit(1);
}

var dynamoDB = new AWS.DynamoDB();

var query = {
  TableName: program.table,
  Limit: program.pageSize || 1// Pagination, page size
};

// if there is a target file, open a write stream
if (!program.describe && program.file && !program.json) {
  var stream = fs.createWriteStream(program.file, { flags: 'a' });
}
var rowCount = 0;
var writeCount = 0;
let queryCount = 1;
let fileCount = 0;

let json = {Items:[]};

writeChunk = program.size || 1;

var describeTable = function (query) {
  dynamoDB.describeTable(
    {
      TableName: program.table
    },
    function (err, data) {
      if (!err) {
        console.dir(data.Table);
      } else console.dir(err);
    }
  );
};

var scanDynamoDB = function (query) {
  dynamoDB.scan(query, function (err, data) {
    if (!err) {
      unMarshalIntoArray(data.Items); // Print out the subset of results.
      if (data.LastEvaluatedKey) {
        // Result is incomplete; there is more to come.
        query.ExclusiveStartKey = data.LastEvaluatedKey;
        if (rowCount >= writeChunk) {
          // once the designated number of items has been read, write out to stream.
          unparseData(data.LastEvaluatedKey);
        }
        console.log(`query : ${queryCount++}`);
        query.Limit = query.Limit + program.speedUpBy
        setTimeout(()=>scanDynamoDB(query), program.cooldownBeforeQuery);
      } else {
        unparseData("File Written");
      }
    } else {
      console.dir(err);
    }
  });
};

var scanDynamoDB2Json = function (query) {
  dynamoDB.scan(query, function (err, data) {
    console.log(`Query No.${queryCount++}`);
    if (!err) {
      rowCount = rowCount + data.Items.length;
      console.log(`loaded ${data.Items.length}, total: ${rowCount}`);
      json.Items.push(...data.Items); // Print out the subset of results.
      if (data.LastEvaluatedKey) {
        // Result is incomplete; there is more to come.
        query.ExclusiveStartKey = data.LastEvaluatedKey;
        if (json.Items.length >= writeChunk) {
          // once the designated number of items has been read, write out to stream.
          save2JsonFile(json);
          json.Items = [];
        }
        query.Limit = query.Limit + program.speedUpBy;
        setTimeout(()=>scanDynamoDB2Json(query), program.cooldownBeforeQuery);
      } else {
        if(json.Items.length > 0) {
          save2JsonFile(json);
        }
        console.log(`File Written, total count : ${rowCount}`);
      }
    } else {
      console.dir(err);
    }
  });
};

let outputFolder = `ouput/${new Date().toISOString().slice(0,19)}`
function save2JsonFile(json) {
  let folderPath = `./${outputFolder}`;
	if (!fs.existsSync(folderPath)) {
		fs.mkdirSync(folderPath, { recursive: true});
  }
  console.log(`Chunk No.${fileCount}, chunk size: ${writeChunk}`);
  fs.writeFileSync(`./${outputFolder}/${fileCount++}.json`, JSON.stringify(json, null, 2));
}

var unparseData = function (lastEvaluatedKey) {
  var endData = Papa.unparse({
    fields: [...headers],
    data: unMarshalledArray
  });
  if (writeCount > 0) {
    // remove column names after first write chunk.
    endData = endData.replace(/(.*\r\n)/, "");;
  }
  if (program.file) {
    writeData(endData);
  } else {
    console.log(endData);
  }
  // Print last evaluated key so process can be continued after stop.
  console.log(lastEvaluatedKey);

  // reset write array. saves memory
  unMarshalledArray = [];
  writeCount += rowCount;
  rowCount = 0;
}

var writeData = function (data) {
  stream.write(data);
};

function unMarshalIntoArray(items) {
  if (items.length === 0) return;

  items.forEach(function (row) {
    let newRow = {};

    // console.log( 'Row: ' + JSON.stringify( row ));
    Object.keys(row).forEach(function (key) {
      if (headers.indexOf(key.trim()) === -1) {
        // console.log( 'putting new key ' + key.trim() + ' into headers ' + headers.toString());
        headers.push(key.trim());
      }
      let newValue = unmarshal(row[key]);

      if (typeof newValue === "object") {
        newRow[key] = JSON.stringify(newValue);
      } else {
        newRow[key] = newValue;
      }
    });

    // console.log( newRow );
    unMarshalledArray.push(newRow);
    rowCount++;
  });
}

if (program.describe) describeTable(query);
else if (program.json) scanDynamoDB2Json(query);
else canDynamoDB(query);
