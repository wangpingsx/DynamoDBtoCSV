# AWS DynamoDBtoCSV

[![Join the chat at https://gitter.im/edasque/DynamoDBtoCSV](https://badges.gitter.im/Join%20Chat.svg)](https://gitter.im/edasque/DynamoDBtoCSV?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

This application will export the content of a DynamoDB table into CSV or json(comma-separated values) output. All you need to do is update `config.json` with your AWS credentials and region.

The output is comma-separated and each field is enclosed by double quotes ("). Double quotes in the data as escaped as \"

This software is governed by the Apache 2.0 license.

## Usage

### CSV

typically, to use you'd run:

    node dynamoDBtoCSV.js -t Hourly_ZEDO_Impressions_by_IP > output.csv

or even:

    node dynamoDBtoCSV.js -t Hourly_ZEDO_Impressions_by_IP -f output.csv

to export to CSV

### Json

    node dynamoDBtoCSV.js -t Hourly_ZEDO_Impressions_by_IP -j

this will output files into `./output` folder

### Read Capacity Consideration

To avoid flood your Dynamo, by default this script is loading 1 row in each query(page size = 1) and this number increase by 1 before each query. e.g. the very first query will return 1 row, and 2nd query will return 2, the 3rd will return 3

Queries are made sequencally and with a delay(cooldown time) the default value is 1 second.

You can change these numbers by parameters, e.g.:

    node dynamoDBtoCSV.js -t Hourly_ZEDO_Impressions_by_IP -j --page-Size 100 --cooldown-before-query 2000 --speed-up-by 50

With above settings if you have auto scaling in place, you can slowly warm up the DB 

### Describe

Use _-d_ to describe the table prior so you can have an idea of the number of rows you are going to export

    node dynamoDBtoCSV.js -t Hourly_ZEDO_Impressions_by_IP -d

to get some information about the table.

## Full syntax is:

    node dynamoDBtoCSV.js --help
    	Usage: dynamoDBtoCSV.js [options]

    Options:

    	-h, --help               output usage information
    	-V, --version            output the version number
    	-t, --table [tablename]  Add the table you want to output to csv
    	-e, --endpoint [url]     Endpoint URL, can be used to dump from local DynamoDB
    	-f, --file [file]        Name of the file to be created
    	-d, --describe
		-j, --json               Save output into json files, this will ignore -f
    	-p, --profile [profile]  Use profile from your credentials file
    	-ec --envcreds           Load AWS Credentials using AWS Credential Provider Chain
		--page-Size [pageSize]   Pagination, this is page size. We will make a query for each page, page size is also the number of lines to read in each query. (default: 1)
  		--cooldown-before-query  Cooldown time between queries in ms. (default: 1000)
  		--speed-up-by            To slowly warm up the auto scaling, increase the page size every query by this number. (default: 1)

## Pre-requisites

You'll need to install a few modules, including:

- aws-sdk
- commander
- dynamodb-marshaler
- papaparse

npm install

should do it.

## Example output

    "HashOf10","DateIPAdID","adcount"
    "37693cfc748049e45d87b8c7d8b9aacd","2013011720024058205168000000010002","1"
    "37693cfc748049e45d87b8c7d8b9aacd","2013011720050084232194000000010002","1"
